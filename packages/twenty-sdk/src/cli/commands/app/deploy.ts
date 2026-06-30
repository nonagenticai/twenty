import { existsSync, readdirSync } from 'fs';
import path from 'path';

import { appBuild, type AppBuildResult } from '@/cli/operations/build';
import { appDeploy } from '@/cli/operations/deploy';
import { appPublish } from '@/cli/operations/publish';
import { type CommandResult } from '@/cli/types';
import { ConfigService } from '@/cli/utilities/config/config-service';
import { CURRENT_EXECUTION_DIRECTORY } from '@/cli/utilities/config/current-execution-directory';
import { readJson } from '@/cli/utilities/file/fs-utils';
import { checkSdkVersionCompatibility } from '@/cli/utilities/version/check-sdk-version-compatibility';
import chalk from 'chalk';

export type DeployCommandOptions = {
  appPath?: string;
  remote?: string;
  private?: boolean;
  tag?: string;
  // Reuse the tarball already baked in .twenty/output instead of rebuilding.
  // The image build (dev:build --tarball) produced an identical artifact, so a
  // deploy-time rebuild only burns memory (~4.3Gi peak) and time.
  skipBuild?: boolean;
};

// Locate a prebuilt *.tgz in the app's .twenty/output directory, if any.
const resolvePrebuiltTarballPath = (appPath: string): string | undefined => {
  const outputDir = path.join(appPath, '.twenty', 'output');

  if (!existsSync(outputDir)) {
    return undefined;
  }

  const tarballName = readdirSync(outputDir).find((fileName) =>
    fileName.endsWith('.tgz'),
  );

  return tarballName ? path.join(outputDir, tarballName) : undefined;
};

export class DeployCommand {
  async execute(options: DeployCommandOptions): Promise<void> {
    if (options.private) {
      await this.executePrivate(options);
    } else {
      await this.executeNpm(options);
    }
  }

  private async executeNpm(options: DeployCommandOptions): Promise<void> {
    const appPath = options.appPath ?? CURRENT_EXECUTION_DIRECTORY;

    await checkSdkVersionCompatibility(appPath);

    console.log(chalk.blue('Publishing to npm...'));
    console.log(chalk.gray(`App path: ${appPath}\n`));

    const result = await appPublish({
      appPath,
      npmTag: options.tag,
      onProgress: (message) => console.log(chalk.gray(message)),
    });

    if (!result.success) {
      console.error(chalk.red(result.error.message));
      process.exit(1);
    }

    console.log(chalk.green('✓ Published to npm successfully'));
  }

  private async executePrivate(options: DeployCommandOptions): Promise<void> {
    const appPath = options.appPath ?? CURRENT_EXECUTION_DIRECTORY;

    await checkSdkVersionCompatibility(appPath);

    const remoteName = options.remote ?? ConfigService.getActiveRemote();

    console.log(chalk.blue(`Deploying application on ${remoteName}...`));
    console.log(chalk.gray(`App path: ${appPath}\n`));

    const onProgress = (message: string) => console.log(chalk.gray(message));

    let buildResult: CommandResult<AppBuildResult>;

    if (options.skipBuild) {
      const prebuiltTarballPath = resolvePrebuiltTarballPath(appPath);

      if (!prebuiltTarballPath) {
        console.error(
          chalk.red(
            '--skip-build was set but no prebuilt tarball was found in .twenty/output (run `dev:build --tarball` first)',
          ),
        );
        process.exit(1);
      }

      console.log(
        chalk.gray(
          `Reusing prebuilt tarball (skip build): ${prebuiltTarballPath}`,
        ),
      );

      buildResult = {
        success: true,
        data: {
          outputDir: path.dirname(prebuiltTarballPath),
          fileCount: 0,
          tarballPath: prebuiltTarballPath,
        },
      };
    } else {
      buildResult = await appBuild({
        appPath,
        tarball: true,
        onProgress,
      });
    }

    if (!buildResult.success) {
      console.error(chalk.red(buildResult.error.message));
      process.exit(1);
    }

    const result = await appDeploy({
      tarballPath: buildResult.data.tarballPath!,
      remote: options.remote,
      onProgress,
    });

    if (!result.success) {
      console.error(chalk.red(result.error.message));
      process.exit(1);
    }

    const packageJson = await readJson<{ name?: string; version?: string }>(
      path.join(appPath, 'package.json'),
    ).catch(() => undefined);

    const appName = packageJson?.name ?? result.data.name;
    const appVersion = packageJson?.version ?? 'unknown';

    console.log(
      chalk.green(`\n✓ Published ${appName} v${appVersion} to ${remoteName}\n`),
    );
    console.log('  To install deployed application: `yarn twenty app:install`');
  }
}
