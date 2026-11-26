package projects

import (
	"net/http"

	"github.com/sicza95/cali-restore-pro/server/internal/identity"
	"github.com/sicza95/cali-restore-pro/server/internal/objectstore"
)

type HTTP struct {
	auth    *identity.HTTP
	service *Service
	objects *objectstore.Store
}

func NewHTTP(auth *identity.HTTP, service *Service) *HTTP {
	return &HTTP{auth: auth, service: service}
}

func (h *HTTP) EnableFiles(root string) { h.objects = &objectstore.Store{Root: root} }

func (h *HTTP) raw(r *http.Request) string { return h.auth.Token(r) }

func (h *HTTP) setCookie(w http.ResponseWriter, raw string) { h.auth.SetCookie(w, raw) }

// Register adds the deletion routes, and the file and sharing routes once
// object storage is enabled. Routes share the identity Guard.
func (h *HTTP) Register(mux *http.ServeMux) {
	route := h.auth.Guard(mux)
	h.deletionRoutes(route)
	h.visibilityRoutes(route)
	if h.objects != nil {
		h.fileRoutes(route, *h.objects)
		h.invitationRoutes(route)
		h.activationRoutes(route)
		h.scopeRoutes(route)
		h.checkpointRoutes(route)
		h.ownerRoutes(route)
		h.hostingRoutes(route)
		h.revisionRoutes(route)
		h.cloudProjectRoutes(route)
		h.revisionKeyRoutes(route)
	}
}
