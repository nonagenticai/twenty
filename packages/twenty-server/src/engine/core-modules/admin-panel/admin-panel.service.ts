import { Injectable } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { AdminPanelUserLookupService } from 'src/engine/core-modules/admin-panel/services/admin-panel-user-lookup.service';
import {
  AuthException,
  AuthExceptionCode,
} from 'src/engine/core-modules/auth/auth.exception';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

@Injectable()
export class AdminPanelService {
  constructor(
    private readonly adminPanelUserLookupService: AdminPanelUserLookupService,
    private readonly roleService: RoleService,
    private readonly userRoleService: UserRoleService,
  ) {}

  // Admin-only cross-workspace promotion used by the external admin server.
  // Assigns the standard Admin role to a member of any workspace. Idempotent:
  // assignRoleToManyUserWorkspace no-ops when the member already holds the role.
  async adminPromoteWorkspaceMemberToAdmin(
    workspaceId: string,
    memberEmail: string,
  ): Promise<boolean> {
    const userWorkspace =
      await this.adminPanelUserLookupService.getUserWorkspaceForMemberEmailOrThrow(
        { workspaceId, email: memberEmail },
      );

    const adminRole = await this.roleService.getRoleByUniversalIdentifier({
      universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
      workspaceId,
    });

    if (!isDefined(adminRole)) {
      throw new AuthException(
        'Admin role not found for workspace',
        AuthExceptionCode.INVALID_INPUT,
        {
          userFriendlyMessage: msg`Admin role not found for this workspace.`,
        },
      );
    }

    await this.userRoleService.assignRoleToManyUserWorkspace({
      workspaceId,
      userWorkspaceIds: [userWorkspace.id],
      roleId: adminRole.id,
    });

    return true;
  }
}
