package identity

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"image"
	_ "image/jpeg" // registers the only accepted photo format
	"strings"
	"time"
	"unicode"

	"github.com/jackc/pgx/v5"
)

var errNoPhoto = errors.New("no profile photo")

// A profile is the person's full name and an optional photo. Neither is a
// security credential: changing them needs a session, not a recent password.
const (
	maxNameRunes  = 100
	maxPhotoBytes = 256 << 10
	// The browser crops and scales the photo before sending it.
	minPhotoSide = 16
	maxPhotoSide = 1024
)

// profileName trims the name and refuses control characters or a name that
// is too long. An empty name is allowed: emails then use a neutral greeting.
func profileName(name string) (string, bool) {
	name = strings.Join(strings.Fields(name), " ")
	if len([]rune(name)) > maxNameRunes || strings.IndexFunc(name, unicode.IsControl) >= 0 {
		return "", false
	}
	return name, true
}

// profilePhoto decodes a base64 JPEG and checks its size and dimensions. An
// empty string means "no photo".
func profilePhoto(encoded string) ([]byte, error) {
	if encoded == "" {
		return []byte{}, nil
	}
	if base64.StdEncoding.DecodedLen(len(encoded)) > maxPhotoBytes+3 {
		return nil, ErrInvalid
	}
	image64, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(image64) == 0 || len(image64) > maxPhotoBytes {
		return nil, ErrInvalid
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(image64))
	if err != nil || format != "jpeg" ||
		config.Width < minPhotoSide || config.Height < minPhotoSide ||
		config.Width > maxPhotoSide || config.Height > maxPhotoSide {
		return nil, ErrInvalid
	}
	return image64, nil
}

// Profile is what a sign-up or a profile change sends. Photo nil keeps the
// current photo; an empty photo removes it.
type Profile struct {
	Name  string
	Photo *string
}

type checkedProfile struct {
	name  string
	photo []byte // nil keeps, empty removes
}

func (p Profile) check() (checkedProfile, error) {
	name, ok := profileName(p.Name)
	if !ok {
		return checkedProfile{}, ErrInvalid
	}
	checked := checkedProfile{name: name}
	if p.Photo != nil {
		photo, err := profilePhoto(*p.Photo)
		if err != nil {
			return checkedProfile{}, err
		}
		checked.photo = photo
	}
	return checked, nil
}

func (p checkedProfile) store(ctx context.Context, tx pgx.Tx, id string) error {
	if _, err := tx.Exec(ctx, `UPDATE accounts SET full_name=$2 WHERE id=$1`, id, p.name); err != nil {
		return err
	}
	switch {
	case p.photo == nil:
		return nil
	case len(p.photo) == 0:
		_, err := tx.Exec(ctx, `DELETE FROM account_photos WHERE account_id=$1`, id)
		return err
	default:
		_, err := tx.Exec(ctx, `INSERT INTO account_photos(account_id,image) VALUES($1,$2)
 ON CONFLICT (account_id) DO UPDATE SET image=EXCLUDED.image,updated_at=clock_timestamp()`, id, p.photo)
		return err
	}
}

// UpdateProfile changes the signed-in person's name and, when given, photo.
func (s *Service) UpdateProfile(ctx context.Context, raw string, profile Profile) error {
	checked, err := profile.check()
	if err != nil {
		return err
	}
	current, err := s.Current(ctx, raw)
	if err != nil {
		return err
	}
	if err = s.rate(ctx, bucket{"global", 60, 120}, bucket{"profile:" + current.Account.ID, 900, 30}); err != nil {
		return err
	}
	tx, err := beginMutation(ctx, s.pool)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	actor, err := LookupSession(ctx, tx, raw)
	if err != nil {
		return err
	}
	if err = checked.store(ctx, tx, actor.Account.ID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Photo returns the signed-in person's own photo.
func (s *Service) Photo(ctx context.Context, raw string) ([]byte, time.Time, error) {
	current, err := s.Current(ctx, raw)
	if err != nil {
		return nil, time.Time{}, err
	}
	var picture []byte
	var updated time.Time
	err = s.pool.QueryRow(ctx, `SELECT image,updated_at FROM account_photos WHERE account_id=$1`, current.Account.ID).Scan(&picture, &updated)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, updated, errNoPhoto
	}
	return picture, updated, err
}
