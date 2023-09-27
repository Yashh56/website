import { OpenAPIV3 } from 'openapi-types';
import { Platform, type Service } from './references';

type SDKMethod = {
	id: string;
	title: string;
	description: string;
	demo: string;
	parameters: Array<{
		name: string;
		description: string;
		required: boolean;
		type: string;
		example: string;
	}>;
	responses: Array<{
		code: number;
		contentType?: string;
		models?: SDKMethodModel[];
	}>;
};

type SDKMethodModel = {
	id: string;
	name: string;
};

type AppwriteOperationObject = OpenAPIV3.OperationObject & {
	'x-appwrite': {
		method: string;
		weight: number;
		cookies: boolean;
		type: string;
		demo: string;
		edit: string;
		'rate-limit': number;
		'rate-time': number;
		'rate-key': string;
		scope: string;
		platforms: string[];
		packaging: boolean;
	};
};

export type AppwriteSchemaObject = OpenAPIV3.SchemaObject & {
	'x-example': string;
};

function getExamples(version: string) {
	switch (version) {
		case '0.15.x':
			return import.meta.glob('$appwrite/docs/examples/0.15.x/**/*.md', {
				as: 'raw'
			});
		case '1.0.x':
			return import.meta.glob('$appwrite/docs/examples/1.0.x/**/*.md', {
				as: 'raw'
			});
		case '1.1.x':
			return import.meta.glob('$appwrite/docs/examples/1.1.x/**/*.md', {
				as: 'raw'
			});
		case '1.2.x':
			return import.meta.glob('$appwrite/docs/examples/1.2.x/**/*.md', {
				as: 'raw'
			});
		case '1.3.x':
			return import.meta.glob('$appwrite/docs/examples/1.3.x/**/*.md', {
				as: 'raw'
			});
		case '1.4.x':
			return import.meta.glob('$appwrite/docs/examples/1.4.x/**/*.md', {
				as: 'raw'
			});
	}
}

function* iterateAllMethods(
	api: OpenAPIV3.Document,
	service: string
): Generator<[OpenAPIV3.HttpMethods, OpenAPIV3.OperationObject]> {
	for (const url in api.paths) {
		const methods = api.paths[url];
		if (methods?.get?.tags?.includes(service)) {
			yield [OpenAPIV3.HttpMethods.GET, methods.get];
		}
		if (methods?.post?.tags?.includes(service)) {
			yield [OpenAPIV3.HttpMethods.POST, methods.post];
		}
		if (methods?.put?.tags?.includes(service)) {
			yield [OpenAPIV3.HttpMethods.PUT, methods.put];
		}
		if (methods?.patch?.tags?.includes(service)) {
			yield [OpenAPIV3.HttpMethods.PATCH, methods.patch];
		}
		if (methods?.delete?.tags?.includes(service)) {
			yield [OpenAPIV3.HttpMethods.DELETE, methods.delete];
		}
	}
}

function getParameters(
	method: OpenAPIV3.HttpMethods,
	operation: AppwriteOperationObject
): SDKMethod['parameters'] {
	const parameters: ReturnType<typeof getParameters> = [];
	if (method === OpenAPIV3.HttpMethods.GET) {
		for (const parameter of (operation?.parameters as OpenAPIV3.ParameterObject[]) ?? []) {
			const schema = parameter.schema as OpenAPIV3.SchemaObject;

			parameters.push({
				name: parameter.name,
				description: parameter.description ?? '',
				required: parameter.required ?? false,
				type: schema?.type ?? '',
				example: schema?.example
			});
		}
	} else {
		const requestBody = operation?.requestBody as OpenAPIV3.RequestBodyObject;
		const schema = requestBody?.content['application/json']?.schema as OpenAPIV3.SchemaObject;
		for (const [key, value] of Object.entries(schema?.properties ?? {})) {
			const property = value as AppwriteSchemaObject;
			parameters.push({
				name: key,
				description: property.description ?? '',
				required: schema?.required?.includes(key) ?? false,
				type: property.type ?? '',
				example: property['x-example'] ?? ''
			});
		}
	}

	return parameters;
}

export function getSchema(id: string, api: OpenAPIV3.Document): OpenAPIV3.SchemaObject {
	const schema = api.components?.schemas?.[id] as OpenAPIV3.SchemaObject;
	if (schema) {
		return schema;
	}
	throw new Error("Schema doesn't exist");
}

const specs = import.meta.glob(
	'$appwrite/app/config/specs/open-api3*-(client|server|console).json',
	{
		as: 'raw'
	}
);
async function getSpec(version: string, platform: string) {
	const isClient = platform.startsWith('client-');
	const isServer = platform.startsWith('server-');
	const target = `/node_modules/@appwrite.io/repo/app/config/specs/open-api3-${version}-${
		isServer ? 'server' : isClient ? 'client' : 'console'
	}.json`;
	return specs[target]();
}

export async function getApi(version: string, platform: string): Promise<OpenAPIV3.Document> {
	const raw = await getSpec(version, platform);
	const api = JSON.parse(raw);
	return api;
}

export async function getService(
	version: string,
	platform: string,
	service: string
): Promise<{
	service: {
		name: Service;
		description: string;
	};
	methods: SDKMethod[];
}> {
	/**
	 * Exceptions for Android SDK.
	 */
	const isAndroidJava = platform === Platform.ClientAndroidJava;
	const isAndroidKotlin = platform === Platform.ClientAndroidKotlin;
	const isAndroid = isAndroidJava || isAndroidKotlin;
	const api = await getApi(version, platform);
	const tag = api.tags?.find((n) => n.name === service);

	const data: Awaited<ReturnType<typeof getService>> = {
		service: {
			name: tag?.name as Service,
			description: tag?.description ?? ''
		},
		methods: []
	};

	const examples = getExamples(version);

	if (!examples) {
		return data;
	}

	for (const [method, value] of iterateAllMethods(api, service)) {
		const operation = value as AppwriteOperationObject;
		const parameters = getParameters(method, operation);
		const responses: SDKMethod['responses'] = Object.entries(operation.responses ?? {}).map(
			(tuple) => {
				const [code, response] = tuple as [string, OpenAPIV3.ResponseObject];
				const models: SDKMethodModel[] = [];
				const schemas = response?.content?.['application/json']?.schema as OpenAPIV3.SchemaObject;
				if (code !== '204') {
					if (schemas?.oneOf) {
						schemas.oneOf.forEach((ref) => {
							const schema = resolveReference(ref as OpenAPIV3.ReferenceObject, api);
							models.push({
								id: getIdFromReference(ref as OpenAPIV3.ReferenceObject),
								name: schema.description ?? ''
							});
						});
					} else {
						if (schemas) {
							const id = getIdFromReference(schemas as OpenAPIV3.ReferenceObject);
							const schema = resolveReference(schemas as OpenAPIV3.ReferenceObject, api);
							models.push({
								id,
								name: schema?.description ?? ''
							});
						}
					}
				}

				return {
					code: Number(code),
					contentType: response?.content ? Object.keys(response.content)[0] : undefined,
					models
				};
			}
		);

		const path = isAndroid
			? `/node_modules/@appwrite.io/repo/docs/examples/${version}/client-android/${
					isAndroidJava ? 'java' : 'kotlin'
			  }/${operation['x-appwrite'].demo}`
			: `/node_modules/@appwrite.io/repo/docs/examples/${version}/${platform}/examples/${operation['x-appwrite'].demo}`;
		if (!(path in examples)) {
			continue;
		}
		data.methods.push({
			id: operation['x-appwrite'].method,
			demo: await examples[path](),
			title: operation.summary ?? '',
			description: operation.description ?? '',
			parameters: parameters ?? [],
			responses: responses ?? []
		});
	}

	return data;
}

export function getIdFromReference(reference: OpenAPIV3.ReferenceObject) {
	const id = reference?.$ref?.split('/')?.pop();
	if (!id) {
		throw new Error('Invalid reference');
	}
	return id;
}

export function resolveReference(
	reference: OpenAPIV3.ReferenceObject,
	api: OpenAPIV3.Document
): AppwriteSchemaObject {
	const id = reference.$ref.split('/').pop();
	if (!id) {
		throw new Error('Invalid reference');
	}
	const schema = api.components?.schemas?.[id] as AppwriteSchemaObject;
	if (schema) {
		return schema;
	}
	throw new Error("Schema doesn't exist");
}