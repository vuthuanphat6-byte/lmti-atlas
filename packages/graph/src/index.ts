import type { DependencyEntry, ModuleEntry } from "@atlas/types";

export function attachModuleDependencies(
  modules: ModuleEntry[],
  dependencies: DependencyEntry[],
  fileToModule: Map<string, string>
): ModuleEntry[] {
  const byName = new Map(modules.map((module) => [module.name, module]));
  const moduleDeps = new Map<string, Set<string>>();

  for (const module of modules) {
    moduleDeps.set(module.name, new Set<string>());
  }

  for (const dependency of dependencies) {
    const fromModule = fileToModule.get(dependency.from);
    if (!fromModule) {
      continue;
    }

    if (dependency.external) {
      moduleDeps.get(fromModule)?.add(dependency.to);
      continue;
    }

    const toModule = fileToModule.get(dependency.to);
    if (toModule && toModule !== fromModule) {
      moduleDeps.get(fromModule)?.add(toModule);
    }
  }

  return modules.map((module) => {
    const deps = Array.from(moduleDeps.get(module.name) ?? []).sort();
    const existing = byName.get(module.name);
    return {
      ...module,
      summary: existing?.summary ?? module.summary,
      dependencies: deps
    };
  });
}
