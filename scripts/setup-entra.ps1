<#
.SYNOPSIS
  One-time Microsoft 365 setup for the Encalm IT Asset Tracker.

.DESCRIPTION
  Run once by a tenant admin (Global Admin, or Application Admin + Groups Admin
  + Exchange Admin). Safe to run again: every step checks what already exists.

    1. App roles Asset.Admin / Asset.Technician / Asset.Viewer on the app registration
    2. Security groups "IT Asset Admins" and "IT Asset Technicians" (+ optional members)
    3. Group -> app role assignments; "Assignment required" = No (all staff can sign in)
    4. Delegated Microsoft Graph permissions + admin consent
    5. "Send As" on the IT helpdesk mailbox for the admins group members (Exchange Online)

  Use -WhatIf to see what would change without changing anything.

.EXAMPLE
  ./setup-entra.ps1 -AdminUsers it.head@encalm.com -TechnicianUsers tech1@encalm.com,tech2@encalm.com

.NOTES
  Needs: Install-Module Microsoft.Graph -Scope CurrentUser
         Install-Module ExchangeOnlineManagement -Scope CurrentUser   (unless -SkipExchange)
  SharePoint list permissions (item-level / unique permissions) are not covered:
  follow docs/DEPLOY.md for those.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$TenantId = "cee20abc-e97b-434e-a89b-e8c8ca3d3d75",
  [string]$ClientId = "96823f1a-bdb9-49c5-8461-d181438c74e3",
  [string]$AdminGroupName = "IT Asset Admins",
  [string]$TechnicianGroupName = "IT Asset Technicians",
  [string[]]$AdminUsers = @(),
  [string[]]$TechnicianUsers = @(),
  [string]$HelpdeskMailbox = "corpit.helpdesk@encalm.com",
  [switch]$SkipExchange
)

$ErrorActionPreference = "Stop"
$GraphAppId = "00000003-0000-0000-c000-000000000000"
$DelegatedScopes = @(
  "User.Read", "User.ReadBasic.All", "Sites.ReadWrite.All", "Sites.Manage.All",
  "Mail.Send", "Mail.Send.Shared", "offline_access", "openid", "profile", "email"
)
$Roles = @(
  @{ Value = "Asset.Admin";      DisplayName = "IT Administrator"; Description = "Full access to the IT Asset Tracker" },
  @{ Value = "Asset.Technician"; DisplayName = "IT Technician";    Description = "Create and edit assets" },
  @{ Value = "Asset.Viewer";     DisplayName = "Auditor / Viewer"; Description = "Read-only access" }
)

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Done($text) { Write-Host "   ok  $text" -ForegroundColor Green }
function Skip($text) { Write-Host "   --  $text" -ForegroundColor DarkGray }

Step "Connecting to Microsoft Graph ($TenantId)"
Connect-MgGraph -TenantId $TenantId -NoWelcome -Scopes @(
  "Application.ReadWrite.All", "AppRoleAssignment.ReadWrite.All",
  "Group.ReadWrite.All", "DelegatedPermissionGrant.ReadWrite.All", "User.Read.All"
)

$app = Get-MgApplication -Filter "appId eq '$ClientId'"
if (-not $app) { throw "App registration $ClientId not found in tenant $TenantId." }
$sp = Get-MgServicePrincipal -Filter "appId eq '$ClientId'"
if (-not $sp) { throw "Enterprise application (service principal) for $ClientId not found." }
Done "App: $($app.DisplayName)"

# --- 1. App roles ---------------------------------------------------------
Step "App roles"
$appRoles = @($app.AppRoles)
$changed = $false
foreach ($r in $Roles) {
  if ($appRoles | Where-Object { $_.Value -eq $r.Value }) { Skip "$($r.Value) exists"; continue }
  $appRoles += @{
    Id                 = [guid]::NewGuid().ToString()
    AllowedMemberTypes = @("User")
    DisplayName        = $r.DisplayName
    Description        = $r.Description
    Value              = $r.Value
    IsEnabled          = $true
  }
  $changed = $true
  Done "adding $($r.Value)"
}
if ($changed -and $PSCmdlet.ShouldProcess($app.DisplayName, "Update app roles")) {
  Update-MgApplication -ApplicationId $app.Id -AppRoles $appRoles
  $app = Get-MgApplication -ApplicationId $app.Id
  $sp = Get-MgServicePrincipal -ServicePrincipalId $sp.Id
}
function RoleId($value) { ($app.AppRoles | Where-Object { $_.Value -eq $value }).Id }

# --- 2. Groups --------------------------------------------------------------
Step "Security groups"
function Ensure-Group($name) {
  $g = Get-MgGroup -Filter "displayName eq '$name'" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($g) { Skip "$name exists"; return $g }
  if (-not $PSCmdlet.ShouldProcess($name, "Create security group")) { return $null }
  $nick = ($name -replace '[^A-Za-z0-9]', '').ToLower()
  $g = New-MgGroup -DisplayName $name -MailEnabled:$false -MailNickname $nick -SecurityEnabled:$true
  Done "created $name"
  return $g
}
function Ensure-Members($group, [string[]]$upns) {
  if (-not $group) { return }
  $current = @(Get-MgGroupMember -GroupId $group.Id -All | ForEach-Object { $_.Id })
  foreach ($upn in $upns) {
    $u = Get-MgUser -UserId $upn -ErrorAction SilentlyContinue
    if (-not $u) { Write-Warning "user $upn not found"; continue }
    if ($current -contains $u.Id) { Skip "$upn already in $($group.DisplayName)"; continue }
    if ($PSCmdlet.ShouldProcess($upn, "Add to $($group.DisplayName)")) {
      New-MgGroupMember -GroupId $group.Id -DirectoryObjectId $u.Id
      Done "added $upn to $($group.DisplayName)"
    }
  }
}
$adminGroup = Ensure-Group $AdminGroupName
$techGroup = Ensure-Group $TechnicianGroupName
Ensure-Members $adminGroup $AdminUsers
Ensure-Members $techGroup $TechnicianUsers

# --- 3. Role assignments + sign-in for everyone -----------------------------
Step "App role assignments"
$assigned = @(Get-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id -All)
foreach ($pair in @(@($adminGroup, "Asset.Admin"), @($techGroup, "Asset.Technician"))) {
  $group = $pair[0]; $roleId = RoleId $pair[1]
  if (-not $group -or -not $roleId) { continue }
  if ($assigned | Where-Object { $_.PrincipalId -eq $group.Id -and $_.AppRoleId -eq $roleId }) {
    Skip "$($group.DisplayName) -> $($pair[1]) exists"; continue
  }
  if ($PSCmdlet.ShouldProcess($group.DisplayName, "Assign $($pair[1])")) {
    New-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id -PrincipalId $group.Id `
      -ResourceId $sp.Id -AppRoleId $roleId | Out-Null
    Done "$($group.DisplayName) -> $($pair[1])"
  }
}
if ($sp.AppRoleAssignmentRequired) {
  if ($PSCmdlet.ShouldProcess($sp.DisplayName, "Set 'Assignment required' to No")) {
    Update-MgServicePrincipal -ServicePrincipalId $sp.Id -AppRoleAssignmentRequired:$false
    Done "Assignment required = No (all staff can sign in as Viewer)"
  }
} else { Skip "Assignment required is already No" }

# --- 4. Graph permissions + admin consent -----------------------------------
Step "Microsoft Graph delegated permissions"
$graphSp = Get-MgServicePrincipal -Filter "appId eq '$GraphAppId'"
$scopeIds = @{}
foreach ($s in $DelegatedScopes) {
  $p = $graphSp.Oauth2PermissionScopes | Where-Object { $_.Value -eq $s }
  if (-not $p) { throw "Graph permission $s not found" }
  $scopeIds[$s] = $p.Id
}
$rra = @($app.RequiredResourceAccess | Where-Object { $_.ResourceAppId -ne $GraphAppId })
$existingGraph = $app.RequiredResourceAccess | Where-Object { $_.ResourceAppId -eq $GraphAppId }
$access = @($existingGraph.ResourceAccess | ForEach-Object { @{ Id = $_.Id; Type = $_.Type } })
$added = @()
foreach ($s in $DelegatedScopes) {
  if (-not ($access | Where-Object { $_.Id -eq $scopeIds[$s] })) {
    $access += @{ Id = $scopeIds[$s]; Type = "Scope" }
    $added += $s
  }
}
if ($added.Count -gt 0) {
  if ($PSCmdlet.ShouldProcess($app.DisplayName, "Add Graph permissions: $($added -join ', ')")) {
    $rra += @{ ResourceAppId = $GraphAppId; ResourceAccess = $access }
    Update-MgApplication -ApplicationId $app.Id -RequiredResourceAccess $rra
    Done "added $($added -join ', ')"
  }
} else { Skip "all permissions already listed" }

$grant = Get-MgOauth2PermissionGrant -Filter "clientId eq '$($sp.Id)' and consentType eq 'AllPrincipals' and resourceId eq '$($graphSp.Id)'" |
  Select-Object -First 1
$wanted = ($DelegatedScopes -join " ")
if ($grant) {
  $have = @($grant.Scope -split " " | Where-Object { $_ })
  $missing = @($DelegatedScopes | Where-Object { $have -notcontains $_ })
  if ($missing.Count -gt 0 -and $PSCmdlet.ShouldProcess("Graph", "Admin consent for $($missing -join ', ')")) {
    Update-MgOauth2PermissionGrant -OAuth2PermissionGrantId $grant.Id -Scope (($have + $missing) -join " ")
    Done "admin consent extended: $($missing -join ', ')"
  } elseif ($missing.Count -eq 0) { Skip "admin consent already covers everything" }
} elseif ($PSCmdlet.ShouldProcess("Graph", "Grant admin consent")) {
  New-MgOauth2PermissionGrant -ClientId $sp.Id -ConsentType "AllPrincipals" -ResourceId $graphSp.Id -Scope $wanted | Out-Null
  Done "admin consent granted"
}

# --- 5. Exchange: Send As on the helpdesk mailbox ---------------------------
if (-not $SkipExchange) {
  Step "Send As on $HelpdeskMailbox"
  Connect-ExchangeOnline -ShowBanner:$false
  $members = @()
  if ($adminGroup) { $members += @(Get-MgGroupMember -GroupId $adminGroup.Id -All) }
  if ($techGroup) { $members += @(Get-MgGroupMember -GroupId $techGroup.Id -All) }
  $existing = @(Get-RecipientPermission -Identity $HelpdeskMailbox -ErrorAction SilentlyContinue |
    Where-Object { $_.AccessRights -contains "SendAs" } | ForEach-Object { $_.Trustee.ToLower() })
  foreach ($m in ($members | Sort-Object Id -Unique)) {
    $u = Get-MgUser -UserId $m.Id -Property UserPrincipalName -ErrorAction SilentlyContinue
    if (-not $u) { continue }
    $upn = $u.UserPrincipalName
    if ($existing -contains $upn.ToLower()) { Skip "$upn already has Send As"; continue }
    if ($PSCmdlet.ShouldProcess($upn, "Send As on $HelpdeskMailbox")) {
      Add-RecipientPermission -Identity $HelpdeskMailbox -Trustee $upn -AccessRights SendAs -Confirm:$false | Out-Null
      Done "Send As for $upn"
    }
  }
} else { Step "Exchange skipped (-SkipExchange)" }

Write-Host "`nDone. Next:" -ForegroundColor Cyan
Write-Host "  - Users sign out and in again to pick up their role."
Write-Host "  - Sign in as an admin -> Settings -> Test SharePoint Connection -> Fix automatically."
Write-Host "  - Set the SharePoint list permissions per group (docs/DEPLOY.md)."
