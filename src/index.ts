import { readFileSync } from "node:fs";
import * as core from "@actions/core";
import { exec, getExecOutput } from "@actions/exec";
import * as io from "@actions/io";
import { type } from "arktype";
import * as jsyaml from "js-yaml";
import * as R from "remeda";
import semver from "semver";

const lsAffectedOutput = type({
  packages: {
    items: type({
      name: "string",
      path: "string",
    }).array(),
  },
});

const queryPackagesOutput = type({
  data: {
    packages: {
      items: type({
        name: "string",
        path: "string",
      }).array(),
    },
  },
});

const turboConfig = type({
  tasks: {
    "[string]": "unknown",
  },
});

const getTurboTasks = (): string[] => {
  const turboConfigFile = core.getInput("turbo-config-file") || "turbo.json";

  try {
    const { tasks } = turboConfig.assert(
      JSON.parse(readFileSync(turboConfigFile, "utf8")),
    );
    return Object.keys(tasks);
  } catch {
    throw new Error(`Failed to read turbo config file: ${turboConfigFile}`);
  }
};

const packagesOrTasksYamlConfig = type({
  "[string]": "string[]",
});

const getPackagesOrTasksYamlConfig = (): Record<string, string[]> | null => {
  const yamlInput = core.getInput("packages-or-tasks-yaml");
  if (!yamlInput.trim()) {
    return null;
  }

  try {
    const parsed = jsyaml.load(yamlInput);
    return packagesOrTasksYamlConfig.assert(parsed);
  } catch (error) {
    throw new Error(`Failed to parse packages-or-tasks-yaml: ${error}`);
  }
};

const installTurborepo = async (): Promise<void> => {
  const p = await io.which("turbo", false);
  if (p === "") {
    core.info('"turbo" does not found. Install turborepo');
    await exec("npm install -g turbo@latest");
    return;
  }

  const { stdout } = await getExecOutput("turbo --version");

  const version = semver.parse(stdout);
  if (version === null) {
    throw new Error("Failed to parse turborepo version");
  }

  if (version.major < 2) {
    throw new Error("turborepo version must be greater than 1");
  }
};

const getAffectedPackages = async (): Promise<string[]> => {
  const { stdout } = await getExecOutput("turbo ls --affected --output json");
  return lsAffectedOutput
    .assert(JSON.parse(stdout))
    .packages.items.map(({ name }) => name);
};

const getTaskPackages = async (task: string): Promise<{
  task: string;
  packages: string[];
}> => {
  const { stdout } = await getExecOutput(
    `turbo query "query { packages(filter: { has: { field: TASK_NAME, value: \\"${task}\\" } }) {items { name path } } }"`,
  );

  return {
    task,
    packages: queryPackagesOutput
      .assert(JSON.parse(stdout))
      .data.packages.items.filter((item) => item.name !== "//")
      .map((item) => item.name),
  };
};

const run = async (): Promise<void> => {
  const tasks = getTurboTasks();
  const yamlConfig = getPackagesOrTasksYamlConfig();

  await installTurborepo();

  const affectedPackages = await getAffectedPackages();
  core.info(`affected-packages: ${JSON.stringify(affectedPackages, null, 2)}`);
  core.setOutput("affected-packages", JSON.stringify(affectedPackages));

  const affectedTasks = (await Promise.all(
    tasks.map((task) => getTaskPackages(task)),
  )).filter(({ packages }) =>
    R.intersection(affectedPackages, packages).length > 0
  ).map(({ task }) => task);
  core.info(`affected-tasks: ${JSON.stringify(affectedTasks, null, 2)}`);
  core.setOutput("affected-tasks", JSON.stringify(affectedTasks));

  for (const task of tasks) {
    core.setOutput(
      `${task}_affected`,
      affectedTasks.includes(task) ? "true" : "false",
    );
  }

  if (yamlConfig !== null) {
    const affectedPackagesOrTasks = [...affectedPackages, ...affectedTasks];
    for (const [key, dependencies] of Object.entries(yamlConfig)) {
      const affected =
        R.intersection(affectedPackagesOrTasks, dependencies).length > 0;
      core.setOutput(`${key}_affected`, affected ? "true" : "false");
      core.info(`${key}_affected: ${affected ? "true" : "false"}`);
    }
  }
};

run();
