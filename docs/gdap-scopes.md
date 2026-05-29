# GDAP scope set — v0.1 + v0.2 + v0.3 (full)

> **P0 ritual — read this before any GDAP relationship is initiated.**
>
> Per [GST-4 plan §6 R2](/GST/issues/GST-4#document-plan): a GDAP scope set is fixed at customer-consent time. Adding scopes later forces every customer to re-consent and re-onboard. We therefore declare the **complete** Microsoft Graph permission set for the entire v0.1 + v0.2 + v0.3 wedge here, on day 1.
>
> **Scope-set changes are treated as P0 incidents.** No scope is added, removed, or re-categorized without:
>
> 1. A PR modifying this file, AND
> 2. An explicit CTO sign-off comment on that PR, AND
> 3. The Azure AD app registration updated in lockstep with the merge.
>
> Once this file is merged with CTO sign-off, **no GDAP relationship may be initiated** until the Azure AD app registration's permission list has been reviewed against this document by the Release Engineer and confirmed identical.

## Status

| Field                                | Value                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Owner of this document               | Release Engineer                                                                                                                     |
| CTO sign-off required for merge      | ✅ Yes — see PR comment                                                                                                              |
| Azure AD app registration            | **Not yet created** (Phase 0). Created during onboarding of the first sandbox tenant in [GST-14](/GST/issues/GST-14).                |
| GDAP relationship status             | **None initiated.** First GDAP relationship is requested in [GST-14](/GST/issues/GST-14) against the M365 Developer Program sandbox. |
| Last review against app registration | _n/a_ — populated on next change.                                                                                                    |

## Scope categories

GDAP scopes the customer-side **delegated** permissions a Cloud Solution Provider's Azure AD app can assume against a customer tenant via the GDAP relationship. We list:

- The Microsoft Graph permission string (the value that appears in the consent prompt).
- The wedge phase that justifies including it on day 1.
- A sample API call we expect to make with it.
- A link to the Microsoft Graph reference for the underlying API.

We use **least privilege per phase**: read scopes are added before write scopes, write scopes are added before delete scopes, and `*.ReadWrite.All` is preferred over more powerful alternatives wherever the documented API permission table allows it.

## v0.1 — Read + suspend (active in the first ship)

### Identity & user lifecycle

| Scope                   | Why (v0.1)                                                                             | Sample call                                                                                               | Graph ref                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `User.Read.All`         | Merged user list — read all users in the tenant.                                       | `GET /v1.0/users?$select=id,displayName,userPrincipalName,accountEnabled,signInActivity,assignedLicenses` | <https://learn.microsoft.com/graph/api/user-list>                          |
| `User.ReadWrite.All`    | Unified suspend — `PATCH accountEnabled:false`. Reversible (we restore on un-suspend). | `PATCH /v1.0/users/{id}` body `{"accountEnabled": false}`                                                 | <https://learn.microsoft.com/graph/api/user-update>                        |
| `Directory.Read.All`    | Read directory metadata used to disambiguate user matching across M365 + Google.       | `GET /v1.0/directory/administrativeUnits`                                                                 | <https://learn.microsoft.com/graph/api/directory-list-administrativeunits> |
| `AuditLog.Read.All`     | v0.1 audit page references M365 sign-in / audit logs to show context for an action.    | `GET /v1.0/auditLogs/signIns?$filter=userId eq '{id}'&$top=5`                                             | <https://learn.microsoft.com/graph/api/signin-list>                        |
| `Organization.Read.All` | Display the tenant the user belongs to in the merged-user UI.                          | `GET /v1.0/organization`                                                                                  | <https://learn.microsoft.com/graph/api/organization-list>                  |

### Sign-in revocation (suspend hygiene)

| Scope                     | Why (v0.1)                                                                                                                | Sample call                                  | Graph ref                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| `User.RevokeSessions.All` | When suspending, also revoke active refresh tokens so the user is signed out everywhere, not just disabled-on-next-token. | `POST /v1.0/users/{id}/revokeSignInSessions` | <https://learn.microsoft.com/graph/api/user-revokesigninsessions> |

## v0.2 — Create user

### Identity & user lifecycle (write)

| Scope                                                               | Why (v0.2)                                                                       | Sample call                                    | Graph ref                                                  |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| `User.ReadWrite.All` _(already granted in v0.1; reused for create)_ | Create a user in M365.                                                           | `POST /v1.0/users`                             | <https://learn.microsoft.com/graph/api/user-post-users>    |
| `Domain.Read.All`                                                   | List verified domains so the create-user UI can show valid UPN suffixes.         | `GET /v1.0/domains?$filter=isVerified eq true` | <https://learn.microsoft.com/graph/api/domain-list>        |
| `Group.Read.All`                                                    | Show groups during user create so the operator can pre-assign group memberships. | `GET /v1.0/groups`                             | <https://learn.microsoft.com/graph/api/group-list>         |
| `GroupMember.ReadWrite.All`                                         | Add the freshly-created user to selected groups in the same flow.                | `POST /v1.0/groups/{id}/members/$ref`          | <https://learn.microsoft.com/graph/api/group-post-members> |

### Licensing

| Scope                             | Why (v0.2)                               | Sample call                           | Graph ref                                                  |
| --------------------------------- | ---------------------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| `LicenseAssignment.ReadWrite.All` | Assign licenses to a newly created user. | `POST /v1.0/users/{id}/assignLicense` | <https://learn.microsoft.com/graph/api/user-assignlicense> |

## v0.3 — Offboard

### Mailbox + drive transfer (Exchange Online + OneDrive)

| Scope                   | Why (v0.3)                                                                   | Sample call                                            | Graph ref                                                             |
| ----------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| `Mail.ReadWrite.Shared` | Reassign mailbox delegate / shared-mailbox access before account delete.     | `POST /v1.0/users/{id}/mailFolders/inbox/messageRules` | <https://learn.microsoft.com/graph/api/messagerule-post-messagerules> |
| `Files.ReadWrite.All`   | Transfer OneDrive ownership during offboard.                                 | `POST /v1.0/drives/{id}/items/{item-id}/permissions`   | <https://learn.microsoft.com/graph/api/driveitem-invite>              |
| `Sites.FullControl.All` | Reassign SharePoint site ownership when the offboarded user is a site owner. | `PATCH /v1.0/sites/{id}`                               | <https://learn.microsoft.com/graph/api/site-update>                   |

### Group membership cleanup

| Scope                                            | Why (v0.3)                                                        | Sample call                                             | Graph ref                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| `GroupMember.ReadWrite.All` _(reused from v0.2)_ | Remove the offboarded user from all groups before account delete. | `DELETE /v1.0/groups/{group-id}/members/{user-id}/$ref` | <https://learn.microsoft.com/graph/api/group-delete-members> |

### Account deletion (irreversible — v0.3 only)

| Scope                    | Why (v0.3)                                                                                                                                                             | Sample call               | Graph ref                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------- |
| `User.DeleteRestore.All` | Soft-delete the user; M365 retains the object for 30 days so accidental offboards can be restored. We do **not** request `User.Delete.All` (hard delete) in any phase. | `DELETE /v1.0/users/{id}` | <https://learn.microsoft.com/graph/api/user-delete> |

## Scopes deliberately NOT requested

These are out of scope for the v0.x wedge and would be P0 additions if requested later:

| Scope                                                        | Why we're not asking for it                                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `User.Delete.All`                                            | Hard-delete bypasses M365's 30-day soft-delete restore window. The Inconsistent-state UX in v0.1 leans on reversibility — hard-delete is incompatible with that posture. |
| `Application.ReadWrite.All` / `RoleManagement.ReadWrite.All` | Power-tools that go beyond the user-lifecycle wedge. Their inclusion would change the trust model the customer consents to.                                              |
| `Mail.Send`                                                  | We do not send mail on the customer's behalf. Offboard notifications are the operator's job.                                                                             |
| `Policy.ReadWrite.*`                                         | We do not edit tenant policies.                                                                                                                                          |
| `IdentityRiskEvent.Read.All` / `IdentityRiskyUser.Read.All`  | Useful for an "intelligent suspend" feature but premium-licensed (Entra ID P2). Defer until customer demand and license posture are clearer.                             |

## How to change this set

1. Open a PR modifying this document. Include in the PR description:
   - The scope being added/removed and the API call that needs it.
   - The wedge feature that justifies the change.
   - A migration plan for every existing customer (since their consent set is now stale and they must re-consent).
2. **Tag the CTO for explicit sign-off.** Their `approved` comment on the PR is required for merge.
3. After merge, the Release Engineer updates the Azure AD app registration's permission list and posts a confirmation comment back on this PR's thread with the screenshot/diff.
4. Notify every onboarded customer that re-consent is required and provide the re-consent URL.

## CTO sign-off — initial scope set

The initial scope set above is pending CTO sign-off on the PR landing this file. Until that sign-off is recorded, no GDAP relationship may be initiated.

- PR: _populated by Release Engineer at PR-open time_.
- CTO sign-off comment: _populated when received_.
- App registration verification: _populated after the first review against the registration in [GST-14](/GST/issues/GST-14)_.
