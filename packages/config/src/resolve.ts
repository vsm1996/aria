import type { AriaConfig, ComponentSemantic } from './index';

/**
 * The interface a lint rule calls at lint time: given a component name and a
 * loaded config, return the declared semantics or undefined.
 *
 * Pure and synchronous by design — rules run synchronously inside the host.
 * `undefined` always means "nothing declared, fall back to inference"; it is
 * returned both when no config exists (config is null) and when the config
 * simply doesn't mention the component. A BROKEN config never reaches here:
 * the loader throws on schema violations, so a rule can trust that undefined
 * is an answer, not an error being swallowed.
 */
export function resolveComponentSemantic(
  config: AriaConfig | null,
  componentName: string,
): ComponentSemantic | undefined {
  const semantics = config?.componentSemantics;
  if (semantics === undefined) return undefined;
  // Own-property check: a component named "toString" or "constructor" must
  // not accidentally resolve through the object prototype.
  if (!Object.prototype.hasOwnProperty.call(semantics, componentName)) return undefined;
  return semantics[componentName];
}
