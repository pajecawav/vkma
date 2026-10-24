/**
 * Pre-`Any*` type names, kept as aliases so older code keeps compiling.
 */

import type { CommunityWidgetType } from "@vkma.dev/bridge-schema";
import type {
	AnyIOMethodName,
	AnyReceiveMethodName,
	AnyReceiveOnlyMethodName,
	AnyRequestMethodName,
	AnyRequestOnlyMethodName,
} from "./types.ts";

/**
 * Name of a method that can be sent.
 * @alias AnyRequestMethodName
 * @deprecated
 */
export type RequestMethodName = AnyRequestMethodName;

/**
 * Name of a method that can be received.
 * @alias AnyReceiveMethodName
 * @deprecated
 */
export type ReceiveMethodName = AnyReceiveMethodName;

/**
 * Name of a method that can be only sent.
 * @alias AnyRequestOnlyMethodName
 * @deprecated
 */
export type RequestOnlyMethodName = AnyRequestOnlyMethodName;

/**
 * Name of a method that can be only received.
 * @alias AnyReceiveOnlyMethodName
 * @deprecated
 */
export type ReceiveOnlyMethodName = AnyReceiveOnlyMethodName;

/**
 * Type of any method name.
 * @alias AnyMethodName
 * @deprecated
 */
export type MethodName = AnyRequestMethodName | AnyReceiveMethodName;

/**
 * The name of the method that can be both sent and received.
 * @alias AnyIOMethodName
 * @deprecated
 */
export type IOMethodName = AnyIOMethodName;

/**
 * Community widget type
 * @alias CommunityWidgetType
 * @deprecated
 */
export type WidgetType = CommunityWidgetType;
