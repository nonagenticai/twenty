import { Test, type TestingModule } from '@nestjs/testing';

import { AdminPanelService } from 'src/engine/core-modules/admin-panel/admin-panel.service';
import { AdminPanelUserLookupService } from 'src/engine/core-modules/admin-panel/services/admin-panel-user-lookup.service';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

describe('AdminPanelService', () => {
  let service: AdminPanelService;
  let adminPanelUserLookupService: {
    getUserWorkspaceForMemberEmailOrThrow: jest.Mock;
  };
  let roleService: { getRoleByUniversalIdentifier: jest.Mock };
  let userRoleService: { assignRoleToManyUserWorkspace: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminPanelService,
        {
          provide: AdminPanelUserLookupService,
          useValue: {
            getUserWorkspaceForMemberEmailOrThrow: jest.fn(),
          },
        },
        {
          provide: RoleService,
          useValue: {
            getRoleByUniversalIdentifier: jest.fn(),
          },
        },
        {
          provide: UserRoleService,
          useValue: {
            assignRoleToManyUserWorkspace: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AdminPanelService>(AdminPanelService);
    adminPanelUserLookupService = module.get(AdminPanelUserLookupService);
    roleService = module.get(RoleService);
    userRoleService = module.get(UserRoleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('adminPromoteWorkspaceMemberToAdmin', () => {
    const workspaceId = 'workspace-id';
    const memberEmail = 'member@acme.com';

    it('should assign the admin role to the resolved user workspace', async () => {
      adminPanelUserLookupService.getUserWorkspaceForMemberEmailOrThrow.mockResolvedValue(
        { id: 'user-workspace-id' },
      );
      roleService.getRoleByUniversalIdentifier.mockResolvedValue({
        id: 'admin-role-id',
      });

      const result = await service.adminPromoteWorkspaceMemberToAdmin(
        workspaceId,
        memberEmail,
      );

      expect(
        adminPanelUserLookupService.getUserWorkspaceForMemberEmailOrThrow,
      ).toHaveBeenCalledWith({ workspaceId, email: memberEmail });
      expect(roleService.getRoleByUniversalIdentifier).toHaveBeenCalledWith({
        universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
        workspaceId,
      });
      expect(
        userRoleService.assignRoleToManyUserWorkspace,
      ).toHaveBeenCalledWith({
        workspaceId,
        userWorkspaceIds: ['user-workspace-id'],
        roleId: 'admin-role-id',
      });
      expect(result).toBe(true);
    });

    it('should be idempotent when the member already has the admin role', async () => {
      adminPanelUserLookupService.getUserWorkspaceForMemberEmailOrThrow.mockResolvedValue(
        { id: 'user-workspace-id' },
      );
      roleService.getRoleByUniversalIdentifier.mockResolvedValue({
        id: 'admin-role-id',
      });
      // assignRoleToManyUserWorkspace internally no-ops when the role is already held.
      userRoleService.assignRoleToManyUserWorkspace.mockResolvedValue(
        undefined,
      );

      await expect(
        service.adminPromoteWorkspaceMemberToAdmin(workspaceId, memberEmail),
      ).resolves.toBe(true);
    });

    it('should throw when the admin role cannot be found', async () => {
      adminPanelUserLookupService.getUserWorkspaceForMemberEmailOrThrow.mockResolvedValue(
        { id: 'user-workspace-id' },
      );
      roleService.getRoleByUniversalIdentifier.mockResolvedValue(null);

      await expect(
        service.adminPromoteWorkspaceMemberToAdmin(workspaceId, memberEmail),
      ).rejects.toThrow();
      expect(
        userRoleService.assignRoleToManyUserWorkspace,
      ).not.toHaveBeenCalled();
    });

    it('should propagate when the member cannot be found', async () => {
      adminPanelUserLookupService.getUserWorkspaceForMemberEmailOrThrow.mockRejectedValue(
        new Error('User not found'),
      );

      await expect(
        service.adminPromoteWorkspaceMemberToAdmin(workspaceId, memberEmail),
      ).rejects.toThrow('User not found');
      expect(roleService.getRoleByUniversalIdentifier).not.toHaveBeenCalled();
      expect(
        userRoleService.assignRoleToManyUserWorkspace,
      ).not.toHaveBeenCalled();
    });
  });
});
