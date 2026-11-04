package identity

type Capability string

const (
	OwnSecurity           Capability = "account.security"
	SuspendAccounts       Capability = "accounts.suspend"
	RevokeAccountSessions Capability = "accounts.sessions.revoke"
	ManageRoles           Capability = "roles.manage"
)

type Account struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	State string `json:"state"`
	Role  string `json:"role"`
}

func (a Account) Allows(capability Capability) bool {
	if a.State != "active" {
		return false
	}
	switch capability {
	case OwnSecurity:
		return a.Role == "member" || a.Role == "administrator" || a.Role == "superuser"
	case SuspendAccounts, RevokeAccountSessions:
		return a.Role == "administrator" || a.Role == "superuser"
	case ManageRoles:
		return a.Role == "superuser"
	default:
		return false
	}
}

// Project rights, hosting entitlement and cryptographic grants are separate.
// No platform role authorizes those actions through this mapping.
func (a Account) Capabilities() []Capability {
	result := []Capability{}
	for _, c := range []Capability{OwnSecurity, SuspendAccounts, RevokeAccountSessions, ManageRoles} {
		if a.Allows(c) {
			result = append(result, c)
		}
	}
	return result
}
