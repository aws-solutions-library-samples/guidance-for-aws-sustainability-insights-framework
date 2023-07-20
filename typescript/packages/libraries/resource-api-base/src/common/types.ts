/*
 *  Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { TLiteral, TNull, TSchema, TUnion, Type, TypeBuilder } from '@sinclair/typebox';
import type { FastifyInstance, FastifyBaseLogger, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault } from 'fastify';
export const apiVersion100: string = '1.0.0';

export type FastifyTypebox = FastifyInstance<RawServerDefault, RawRequestDefaultExpression<RawServerDefault>, RawReplyDefaultExpression<RawServerDefault>, FastifyBaseLogger, TypeBoxTypeProvider>;

export type DynamoDbPaginationKey = { [key: string]: string } | undefined;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function stringEnum<T extends string[]>(values: [...T], description: string, defaultOption?: string) {
	return Type.Unsafe<T[number]>({ type: 'string', enum: values, description, default: defaultOption });
}

type IntoStringLiteralUnion<T> = { [K in keyof T]: T[K] extends string ? TLiteral<T[K]> : never };

export class OpenApiTypeBuilder extends TypeBuilder {
	public Nullable<T extends TSchema>(schema: T): TUnion<[T, TNull]> {
		return { ...schema, nullable: true } as any;
	}

	public StringEnum<T extends string[]>(values: [...T]): TUnion<IntoStringLiteralUnion<T>> {
		return { enum: values } as any;
	}
}
