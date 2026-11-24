package identity

type Capability string

const (
	OwnSecurity           Capability = "account.security"
	SuspendAccounts       Capability = "accounts.suspend"
	RevokeAccountSessions Capability = "accounts.sessions.revoke"
	ManageRoles           Capability = "roles.manage"
	ViewAccounts          Capability = "accounts.view"
	ManageEntitlements    Capability = "accounts.entitlements"
	ViewOperations        Capability = "operations.view"
)

type Account struct {
	ID               string `json:"id"`
	Email            string `json:"email"`
	State            string `json:"state"`
	Role             string `json:"role"`
	AdminPermissions int    `json:"-"`
	// Name is the full name; empty for accounts created before names existed.
	Name string `json:"name"`
	// Photo is the versioned URL of the person's own photo, nil without one.
	Photo *string `json:"photo,omitempty"`
}

func (a Account) Allows(capability Capability) bool {
	if a.State != "active" {
		return false
	}
	if capability == OwnSecurity {
		return a.Role == "member" || a.Role == "administrator" || a.Role == "superuser"
	}
	if a.Role != "administrator" && a.Role != "superuser" {
		return false
	}
	var mask int
	switch capability {
	case SuspendAccounts, RevokeAccountSessions:
		mask = 1
	case ManageEntitlements:
		mask = 2
	case ViewOperations:
		mask = 4
	case ViewAccounts:
		mask = 3
	case ManageRoles:
		return a.Role == "superuser"
	default:
		return false
	}
	return a.Role == "superuser" || a.AdminPermissions&mask != 0
}

// Platform roles do not confer project rights, hosting entitlement or keys.
func (a Account) Capabilities() []Capability {
	result := []Capability{}
	for _, c := range []Capability{OwnSecurity, SuspendAccounts, RevokeAccountSessions, ManageRoles, ViewAccounts, ManageEntitlements, ViewOperations} {
		if a.Allows(c) {
			result = append(result, c)
		}
	}
	return result
}
