import { readFileSync } from "node:fs";
import * as core from "@actions/core";
import { exec, getExecOutput } from "@actions/exec";
import * as io from "@actions/io";
import { type } from "arktype";
import * as jsyaml from "js-yaml";
import * as R from "remeda";
import semver from "semver";

const runGroup = async <T>(title: string, fn: () => Promise<T>): Promise<T> => {
  core.startGroup(title);
  try {
    return fn();
  } finally {
    core.endGroup();
  }
};

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

const getInput = (): string[] => {
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

const run = async (): Promise<void> => {
  await installTurborepo();

  const tasks = getInput();

  const affectedPackages = await runGroup("Get affected packages", async () => {
    const { stdout } = await getExecOutput("turbo ls --affected --output json");
    return lsAffectedOutput
      .assert(JSON.parse(stdout))
      .packages.items.map(({ name }) => name);
  });
  core.setOutput("affected-packages", JSON.stringify(affectedPackages));

  const outputs = await runGroup("List packages for each task", async () => {
    return Promise.all(
      tasks.map((task) =>
        getExecOutput(
          `turbo query "query { packages(filter: { has: { field: TASK_NAME, value: \\"${task}\\" } }) {items { name path } } }"`,
        ).then((output) => {
          return {
            task,
            packages: queryPackagesOutput
              .assert(JSON.parse(output.stdout))
              .data.packages.items.filter((item) => item.name !== "//")
              .map((item) => item.name),
          };
        }),
      ),
    );
  });

  await runGroup("Set outputs", async () => {
    const res: Record<string, "true" | "false"> = {};
    for (const { task, packages } of outputs) {
      const taskName = task.replaceAll(":", "-");
      const changed =
        R.intersection(affectedPackages, packages).length > 0
          ? "true"
          : "false";

      core.setOutput(taskName, changed);
      res[taskName] = changed;
    }
    core.setOutput("tasks", res);
  });
};

run();
