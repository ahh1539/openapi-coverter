import * as yaml from 'js-yaml';

// Define TypeScript interfaces for OpenAPI objects
interface OpenAPIOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  security?: any[];
  requestBody?: {
    required?: boolean;
    description?: string;
    content?: Record<string, { schema?: any }>;
  };
  responses?: Record<string, {
    description?: string;
    content?: Record<string, { schema?: any }>;
  }>;
  parameters?: any[];
}

interface OpenAPIPathItem {
  parameters?: any[];
  $ref?: string;
  summary?: string;
  description?: string;
  get?: OpenAPIOperation;
  put?: OpenAPIOperation;
  post?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  options?: OpenAPIOperation;
  head?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  trace?: OpenAPIOperation;
}

interface OpenAPISpec {
  openapi: string;
  info: any;
  servers?: { url: string }[];
  security?: any[];
  paths?: Record<string, OpenAPIPathItem>;
  components?: {
    schemas?: Record<string, any>;
    securitySchemes?: Record<string, any>;
    callbacks?: any;
    links?: any;
  };
}

interface SwaggerSpec {
  swagger: string;
  info: any;
  host?: string;
  basePath?: string;
  schemes?: string[];
  consumes?: string[];
  produces?: string[];
  security?: any[];
  paths?: Record<string, SwaggerPathItem>;
  definitions?: Record<string, any>;
  securityDefinitions?: Record<string, any>;
}

// Add a SwaggerPathItem interface to match OpenAPIPathItem
interface SwaggerPathItem {
  parameters?: any[];
  $ref?: string;
  summary?: string;
  description?: string;
  get?: SwaggerOperation;
  put?: SwaggerOperation;
  post?: SwaggerOperation;
  delete?: SwaggerOperation;
  options?: SwaggerOperation;
  head?: SwaggerOperation;
  patch?: SwaggerOperation;
  trace?: SwaggerOperation;
}

// Define interfaces for Swagger operation and response objects
interface SwaggerOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  security?: any[];
  parameters?: any[];
  responses?: Record<string, SwaggerResponse>;
  consumes?: string[];
  produces?: string[];
}

interface SwaggerResponse {
  description?: string;
  schema?: any;
}

// Enum for conversion directions
export enum ConversionDirection {
  OPENAPI_TO_SWAGGER = 'openapi-to-swagger',
  SWAGGER_TO_OPENAPI = 'swagger-to-openapi'
}

// Helper function to fix $ref paths for Swagger 2.0
function fixSwagger2References(obj: any): any {
  if (!obj) return obj;
  
  if (typeof obj === 'object') {
    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => fixSwagger2References(item));
    }
    
    // Handle objects
    const result: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Handle $ref specifically
      if (key === '$ref' && typeof value === 'string') {
        // Replace components/schemas with definitions
        result[key] = value.replace('#/components/schemas/', '#/definitions/');
      } 
      // Handle anyOf (not supported in Swagger 2.0)
      else if (key === 'anyOf' || key === 'oneOf') {
        // Pick the first non-null schema or just the first one
        const schemas = value as any[];
        
        // Check if this is a nullable type case
        const nonNullSchemas = schemas.filter(schema => !schema.type || schema.type !== 'null');
        const hasNullType = schemas.some(schema => schema.type === 'null');
        
        if (nonNullSchemas.length === 1 && hasNullType) {
          // Simple nullable case: prefer first non-null schema
          const nonNullSchema = nonNullSchemas[0];
          
          // Apply the non-null schema properties directly to the parent
          Object.entries(nonNullSchema).forEach(([k, v]) => {
            result[k] = fixSwagger2References(v);
          });
          
          // Add x-nullable to indicate nullable property
          result['x-nullable'] = true;
        } 
        else if (nonNullSchemas.length > 0) {
          // Multiple non-null schemas - pick the most specific or first one
          // Try to find one with a type that's not 'object' as it's more specific
          const mostSpecificSchema = nonNullSchemas.find(schema => 
            schema.type && schema.type !== 'object'
          ) || nonNullSchemas[0];
          
          // Apply the chosen schema properties to the parent
          Object.entries(mostSpecificSchema).forEach(([k, v]) => {
            result[k] = fixSwagger2References(v);
          });
          
          // Add description about this being a simplified representation if not already present
          if (!result.description) {
            result.description = 'This is a simplified representation of a more complex type.';
          } else if (!result.description.includes('simplified representation')) {
            result.description += ' (This is a simplified representation of a more complex type.)';
          }
          
          // Add x-nullable if null was an option
          if (hasNullType) {
            result['x-nullable'] = true;
          }
        } 
        else {
          // Fallback to generic object type if no clear schema found
          result.type = 'object';
          result.description = result.description || 'Complex type that requires custom validation.';
        }
      }
      // Handle allOf (partially supported in Swagger 2.0)
      else if (key === 'allOf') {
        // For allOf, we need to attempt to merge schemas
        // This is a simplified approach; full merging is complex
        const mergedSchema: any = {};
        
        // Try to merge properties of all schemas
        for (const schema of (value as any[])) {
          if (schema.$ref) {
            // If it has a $ref, we'll keep it in the allOf
            if (!result.allOf) result.allOf = [];
            result.allOf.push(fixSwagger2References(schema));
          } else {
            // For non-$ref schemas, try to merge them
            Object.entries(schema).forEach(([propKey, propValue]) => {
              if (propKey === 'properties' && typeof propValue === 'object') {
                mergedSchema.properties = mergedSchema.properties || {};
                Object.assign(mergedSchema.properties, propValue);
              } else if (propKey === 'required' && Array.isArray(propValue)) {
                mergedSchema.required = mergedSchema.required || [];
                mergedSchema.required = [...mergedSchema.required, ...propValue];
              } else {
                // For other keys, override with the latest value
                mergedSchema[propKey] = propValue;
              }
            });
          }
        }
        
        // Apply merged properties if we have them
        if (Object.keys(mergedSchema).length > 0) {
          Object.entries(mergedSchema).forEach(([k, v]) => {
            if (k !== 'allOf') { // Avoid circular reference
              result[k] = fixSwagger2References(v);
            }
          });
        }
        
        // If we still have $ref schemas in allOf, keep them
        if (result.allOf && result.allOf.length > 0) {
          // Keep it as is
        } else {
          // We merged everything, so we don't need allOf
          delete result.allOf;
        }
      }
      // Handle "not" schema (not supported in Swagger 2.0)
      else if (key === 'not') {
        // Cannot represent "not" in Swagger 2.0, so add description
        result.description = result.description || '';
        if (!result.description.includes('with exclusions')) {
          result.description += ' (Complex type with exclusions that cannot be fully represented in Swagger 2.0.)';
        }
        
        // Default to object type if no type specified
        if (!result.type) {
          result.type = 'object';
        }
      }
      // For all other properties, recurse
      else {
        result[key] = fixSwagger2References(value);
      }
    }
    
    return result;
  }
  
  // Return primitives unchanged
  return obj;
}

// Ensure all non-body parameters have a type
function ensureParameterTypes(parameters: any[]): any[] {
  if (!parameters) return parameters;
  
  return parameters.map(param => {
    const newParam = { ...param };
    
    if (param.in !== 'body') {
      if (!param.type && !param.schema) {
        // Default to string if no type is specified
        newParam.type = 'string';
      }
      
      // If we have a schema but not a type, extract type from schema
      if (param.schema && !param.type) {
        if (param.schema.$ref) {
          // If schema is a reference, keep it as a schema
          // This is technically not Swagger 2.0 compatible, but 
          // fixSwagger2References will handle it later
        } else {
          // Extract type and related properties from schema
          const schemaProps = ['type', 'format', 'enum', 'minimum', 'maximum', 
                             'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
                             'minLength', 'maxLength', 'pattern', 'minItems', 
                             'maxItems', 'uniqueItems', 'default'];
          
          for (const prop of schemaProps) {
            if (param.schema[prop] !== undefined) {
              newParam[prop] = param.schema[prop];
            }
          }
          
          // Handle array items
          if (param.schema.type === 'array' && param.schema.items) {
            newParam.items = param.schema.items;
          }
          
          // We've extracted the schema properties, so we don't need the schema anymore
          delete newParam.schema;
        }
      }
    }
    
    return newParam;
  });
}

// Detect OpenAPI 3.x features that aren't fully supported in Swagger 2.0
export function detectUnsupportedFeatures(openApiSpec: OpenAPISpec): string[] {
  const warnings: string[] = [];
  
  // Check for callbacks (not supported in Swagger 2.0)
  if (openApiSpec.components?.callbacks) {
    warnings.push('Callbacks are not supported in Swagger 2.0 and will be removed.');
  }
  
  // Check for links (not supported in Swagger 2.0)
  if (openApiSpec.components?.links) {
    warnings.push('Links are not supported in Swagger 2.0 and will be removed.');
  }
  
  // Check for oneOf, anyOf, allOf in schemas
  if (openApiSpec.components?.schemas) {
    const schemas = Object.entries(openApiSpec.components.schemas);
    
    for (const [schemaName, schema] of schemas) {
      if (schema.oneOf) {
        warnings.push(`oneOf in schema "${schemaName}" will be simplified to the first schema in the list with x-nullable if null is an option.`);
      }
      if (schema.anyOf) {
        warnings.push(`anyOf in schema "${schemaName}" will be simplified to the first schema in the list with x-nullable if null is an option.`);
      }
      if (schema.not) {
        warnings.push(`"not" keyword in schema "${schemaName}" is not supported in Swagger 2.0 and will be simplified.`);
      }
    }
  }
  
  // Check for multiple content types in request bodies
  if (openApiSpec.paths) {
    for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
      for (const [method, operation] of Object.entries(pathItem as OpenAPIPathItem)) {
        if (method === 'parameters' || method === '$ref') continue;
        
        const op = operation as OpenAPIOperation;
        if (op.requestBody?.content && Object.keys(op.requestBody.content).length > 1) {
          warnings.push(`Multiple request content types in ${method.toUpperCase()} ${path} will be consolidated to a single schema.`);
        }
        
        // Check for responses with multiple content types
        if (op.responses) {
          for (const [statusCode, response] of Object.entries(op.responses)) {
            if (response.content && Object.keys(response.content).length > 1) {
              warnings.push(`Multiple response content types for status ${statusCode} in ${method.toUpperCase()} ${path} will be consolidated.`);
            }
          }
        }
      }
    }
  }
  
  // Check for multiple servers
  if (openApiSpec.servers && openApiSpec.servers.length > 1) {
    warnings.push('Multiple servers defined. Only the first one will be used in the converted Swagger 2.0 specification.');
  }
  
  // Check for cookie parameters
  let hasCookieParams = false;
  if (openApiSpec.paths) {
    for (const pathItem of Object.values(openApiSpec.paths)) {
      for (const [method, operation] of Object.entries(pathItem as OpenAPIPathItem)) {
        if (method === 'parameters' || method === '$ref') continue;
        
        const op = operation as OpenAPIOperation;
        if (op.parameters) {
          for (const param of op.parameters) {
            if (param.in === 'cookie') {
              hasCookieParams = true;
              break;
            }
          }
        }
      }
      if (hasCookieParams) break;
    }
  }
  
  if (hasCookieParams) {
    warnings.push('Cookie parameters are not supported in Swagger 2.0 and will be converted to header parameters.');
  }
  
  return warnings;
}

// Detect Swagger 2.0 features that aren't fully supported in OpenAPI 3.x
export function detectSwaggerUnsupportedFeatures(swaggerSpec: SwaggerSpec): string[] {
  const warnings: string[] = [];
  
  // Check for multiple produces/consumes at the global level
  if (swaggerSpec.produces && swaggerSpec.produces.length > 1) {
    warnings.push('Multiple global "produces" values will be converted to individual response content types in OpenAPI 3.x.');
  }
  
  if (swaggerSpec.consumes && swaggerSpec.consumes.length > 1) {
    warnings.push('Multiple global "consumes" values will be converted to individual request content types in OpenAPI 3.x.');
  }
  
  // Check for specific parameter formats
  if (swaggerSpec.paths) {
    for (const [path, pathItem] of Object.entries(swaggerSpec.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (method === 'parameters') continue;
        
        const op = operation as SwaggerOperation;
        
        // Check for formData parameters
        const hasFormData = (op.parameters || []).some((param: any) => param.in === 'formData');
        if (hasFormData) {
          warnings.push(`formData parameters in ${method.toUpperCase()} ${path} will be converted to requestBody with content type application/x-www-form-urlencoded or multipart/form-data.`);
        }
        
        // Check for body parameters with non-JSON content types
        const bodyParams = (op.parameters || []).filter((param: any) => param.in === 'body');
        if (bodyParams.length > 0 && (!swaggerSpec.consumes || !swaggerSpec.consumes.includes('application/json'))) {
          warnings.push(`Body parameters in ${method.toUpperCase()} ${path} with non-JSON content types will be converted to appropriate request body media types.`);
        }
      }
    }
  }
  
  return warnings;
}

// Convert OpenAPI 3.x to Swagger 2.0
export function convertOpenApiToSwagger(yamlContent: string): { content: string; warnings: string[] } {
  try {
    // Parse the YAML content to JavaScript object
    const openApiSpec = yaml.load(yamlContent) as OpenAPISpec;
    
    // Validate if it's an OpenAPI spec
    if (!openApiSpec.openapi || !openApiSpec.openapi.startsWith('3.')) {
      throw new Error('The provided file is not a valid OpenAPI 3.x specification');
    }
    
    // Detect unsupported features and generate warnings
    const warnings = detectUnsupportedFeatures(openApiSpec);
    
    // Create base Swagger 2.0 structure
    const swaggerSpec: any = {
      swagger: '2.0',
      info: openApiSpec.info,
      host: '',
      basePath: '/',
      schemes: ['https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      paths: {},
      definitions: {},
      securityDefinitions: {}
    };
    
    // Add global security if available
    if (openApiSpec.security) {
      swaggerSpec.security = openApiSpec.security;
    }
    
    // Extract host and basePath from servers if available
    if (openApiSpec.servers && openApiSpec.servers.length > 0) {
      const serverUrl = new URL(openApiSpec.servers[0].url);
      swaggerSpec.host = serverUrl.host;
      swaggerSpec.basePath = serverUrl.pathname || '/';
      
      if (serverUrl.protocol) {
        swaggerSpec.schemes = [serverUrl.protocol.replace(':', '')];
      }
    }
    
    // Convert components/schemas to definitions
    if (openApiSpec.components && openApiSpec.components.schemas) {
      swaggerSpec.definitions = openApiSpec.components.schemas;
    }
    
    // Convert security schemes
    if (openApiSpec.components && openApiSpec.components.securitySchemes) {
      for (const [key, scheme] of Object.entries(openApiSpec.components.securitySchemes)) {
        swaggerSpec.securityDefinitions[key] = convertSecurityScheme(scheme as any);
      }
    }
    
    // Convert paths
    if (openApiSpec.paths) {
      for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
        swaggerSpec.paths[path] = {};
        const swaggerPath = swaggerSpec.paths[path];
        
        // Handle path-level parameters if they exist
        if (pathItem.parameters) {
          swaggerPath.parameters = convertParameters(pathItem.parameters);
        }
        
        for (const [method, operation] of Object.entries(pathItem as any)) {
          if (method === 'parameters' || method === '$ref') continue;
          
          swaggerPath[method] = convertOperation(operation as OpenAPIOperation);
          
          // Preserve operation-level security
          if ((operation as OpenAPIOperation).security) {
            swaggerPath[method].security = (operation as OpenAPIOperation).security;
          }
        }
      }
    }
    
    // Fix all $ref paths and handle anyOf/oneOf
    const fixedSwaggerSpec = fixSwagger2References(swaggerSpec);
    
    // Force one last pass to ensure all parameters have types
    if (fixedSwaggerSpec.paths) {
      for (const pathItem of Object.values(fixedSwaggerSpec.paths)) {
        for (const [method, operation] of Object.entries(pathItem as any)) {
          if (method === 'parameters') {
            // Ensure path-level parameters have types
            pathItem.parameters = ensureParameterTypes(pathItem.parameters);
          } else if (method !== '$ref' && operation.parameters) {
            // Ensure operation-level parameters have types
            operation.parameters = ensureParameterTypes(operation.parameters);
          }
        }
      }
    }
    
    // Convert to YAML
    return { 
      content: yaml.dump(fixedSwaggerSpec),
      warnings 
    };
  } catch (error) {
    console.error('Conversion error:', error);
    throw error;
  }
}

// Convert parameters for OpenAPI to Swagger
function convertParameters(parameters: any[]): any[] {
  if (!parameters) return [];
  
  const convertedParams = parameters.map(param => {
    // Handle cookie parameters (not supported in Swagger 2.0)
    if (param.in === 'cookie') {
      param = { ...param, in: 'header' };
    }
    
    // Handle 'schema' in non-body parameters (move properties up a level)
    if (param.in !== 'body' && param.schema) {
      const converted = { ...param };
      
      if (param.schema.$ref) {
        // If it's a reference, keep the schema
        // It will be fixed by fixSwagger2References later
      } else {
        // Extract schema properties to parameter level
        const schemaProps = ['type', 'format', 'enum', 'minimum', 'maximum', 
                           'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
                           'minLength', 'maxLength', 'pattern', 'minItems', 
                           'maxItems', 'uniqueItems', 'default'];
        
        for (const prop of schemaProps) {
          if (param.schema[prop] !== undefined) {
            converted[prop] = param.schema[prop];
          }
        }
        
        // Handle array items
        if (param.schema.type === 'array' && param.schema.items) {
          converted.items = param.schema.items;
          // Swagger 2.0 requires 'items' for array types
          if (!converted.items) {
            converted.items = { type: 'string' };
          }
        }
        
        // Remove schema after extraction
        delete converted.schema;
      }
      
      return converted;
    }
    
    return param;
  });
  
  // Ensure all parameters have types
  return ensureParameterTypes(convertedParams);
}

// Convert Swagger 2.0 to OpenAPI 3.x
export function convertSwaggerToOpenApi(yamlContent: string): { content: string; warnings: string[] } {
  try {
    // Parse the YAML content to JavaScript object
    const swaggerSpec = yaml.load(yamlContent) as SwaggerSpec;
    
    // Validate if it's a Swagger spec
    if (!swaggerSpec.swagger || swaggerSpec.swagger !== '2.0') {
      throw new Error('The provided file is not a valid Swagger 2.0 specification');
    }
    
    // Detect unsupported features and generate warnings
    const warnings = detectSwaggerUnsupportedFeatures(swaggerSpec);
    
    // Create base OpenAPI 3.0 structure
    const openApiSpec: any = {
      openapi: '3.0.0',
      info: swaggerSpec.info,
      paths: {},
      components: {
        schemas: {},
        securitySchemes: {}
      }
    };
    
    // Add global security if available
    if (swaggerSpec.security) {
      openApiSpec.security = swaggerSpec.security;
    }
    
    // Convert host, basePath, and schemes to servers
    const serverUrl = buildServerUrl(swaggerSpec);
    openApiSpec.servers = [{ url: serverUrl }];
    
    // Convert definitions to components/schemas
    if (swaggerSpec.definitions) {
      openApiSpec.components.schemas = swaggerSpec.definitions;
    }
    
    // Convert security definitions
    if (swaggerSpec.securityDefinitions) {
      for (const [key, definition] of Object.entries(swaggerSpec.securityDefinitions)) {
        openApiSpec.components.securitySchemes[key] = convertSecurityDefinitionToScheme(definition as any);
      }
    }
    
    // Convert paths
    if (swaggerSpec.paths) {
      for (const [path, pathItem] of Object.entries(swaggerSpec.paths)) {
        openApiSpec.paths[path] = {};
        const openApiPath = openApiSpec.paths[path];
        
        // Handle path-level parameters
        if (pathItem.parameters) {
          openApiPath.parameters = convertSwaggerParametersToOpenApi(pathItem.parameters);
        }
        
        for (const [method, operation] of Object.entries(pathItem)) {
          if (method === 'parameters') continue;
          
          openApiPath[method] = convertSwaggerOperationToOpenApi(
            operation as SwaggerOperation,
            swaggerSpec.consumes || ['application/json'],
            swaggerSpec.produces || ['application/json']
          );
          
          // Preserve operation-level security
          if ((operation as SwaggerOperation).security) {
            openApiPath[method].security = (operation as SwaggerOperation).security;
          }
        }
      }
    }
    
    // Fix any remaining issues
    fixOpenApiReferences(openApiSpec);
    
    // Convert to YAML
    return { 
      content: yaml.dump(openApiSpec),
      warnings 
    };
  } catch (error) {
    console.error('Conversion error:', error);
    throw error;
  }
}

// Fix references in OpenAPI 3.0 spec
function fixOpenApiReferences(obj: any): void {
  if (typeof obj !== 'object' || obj === null) return;
  
  if (Array.isArray(obj)) {
    obj.forEach(item => fixOpenApiReferences(item));
    return;
  }
  
  for (const [key, value] of Object.entries(obj)) {
    if (key === '$ref' && typeof value === 'string') {
      // Update #/definitions/ references to #/components/schemas/
      obj[key] = value.replace('#/definitions/', '#/components/schemas/');
    } else if (typeof value === 'object' && value !== null) {
      fixOpenApiReferences(value);
    }
  }
}

// Convert Swagger parameters to OpenAPI 3.0 format
function convertSwaggerParametersToOpenApi(parameters: any[]): any[] {
  if (!parameters) return [];
  
  return parameters.map(param => {
    // Clone to avoid mutating the original
    const newParam = { ...param };
    
    // Convert non-body, non-formData parameters
    if (param.in !== 'body' && param.in !== 'formData') {
      // Move parameter-level type properties into a schema object
      if (param.type || param.format || param.items || param.enum) {
        newParam.schema = {
          type: param.type,
          format: param.format,
          enum: param.enum
        };
        
        // Handle array items
        if (param.type === 'array' && param.items) {
          newParam.schema.items = param.items;
        }
        
        // Clean up null values
        newParam.schema = Object.fromEntries(
          Object.entries(newParam.schema).filter(([_, v]) => v !== undefined)
        );
        
        // Remove properties that are now in schema
        delete newParam.type;
        delete newParam.format;
        delete newParam.items;
        delete newParam.enum;
      }
    }
    
    // Form and body params are handled separately in the operation conversion
    
    return newParam;
  });
}

// Build server URL from Swagger spec
function buildServerUrl(swaggerSpec: SwaggerSpec): string {
  const scheme = swaggerSpec.schemes && swaggerSpec.schemes.length > 0 
    ? swaggerSpec.schemes[0] 
    : 'https';
  
  const host = swaggerSpec.host || 'example.com';
  const basePath = swaggerSpec.basePath || '/';
  
  return `${scheme}://${host}${basePath}`;
}

// Convert Swagger operation to OpenAPI operation
function convertSwaggerOperationToOpenApi(
  operation: SwaggerOperation, 
  globalConsumes: string[], 
  globalProduces: string[]
): any {
  const openApiOperation: any = {
    summary: operation.summary,
    description: operation.description,
    operationId: operation.operationId,
    tags: operation.tags,
    responses: {}
  };
  
  // Preserve security requirements if present
  if (operation.security) {
    openApiOperation.security = operation.security;
  }
  
  // Handle parameters
  if (operation.parameters) {
    const bodyParams = operation.parameters.filter((p: any) => p.in === 'body');
    const formDataParams = operation.parameters.filter((p: any) => p.in === 'formData');
    const otherParams = operation.parameters.filter((p: any) => p.in !== 'body' && p.in !== 'formData');
    
    // Handle regular parameters
    if (otherParams.length > 0) {
      openApiOperation.parameters = convertSwaggerParametersToOpenApi(otherParams);
    }
    
    // Handle body parameter - convert to requestBody
    if (bodyParams.length > 0) {
      const bodyParam = bodyParams[0];  // Swagger only allows one body parameter
      
      openApiOperation.requestBody = {
        description: bodyParam.description,
        required: !!bodyParam.required,
        content: {}
      };
      
      // Determine content types from operation or global consumes
      const contentTypes = operation.consumes || globalConsumes;
      
      contentTypes.forEach((contentType: string) => {
        openApiOperation.requestBody.content[contentType] = {
          schema: bodyParam.schema
        };
      });
    }
    
    // Handle formData parameters - convert to requestBody
    if (formDataParams.length > 0) {
      const contentType = formDataParams.some((p: any) => p.type === 'file')
        ? 'multipart/form-data'
        : 'application/x-www-form-urlencoded';
      
      const properties: Record<string, any> = {};
      const required: string[] = [];
      
      formDataParams.forEach((param: any) => {
        properties[param.name] = {
          type: param.type,
          description: param.description
        };
        
        // Handle array type
        if (param.type === 'array' && param.items) {
          properties[param.name].items = param.items;
        }
        
        // Handle enum
        if (param.enum) {
          properties[param.name].enum = param.enum;
        }
        
        if (param.required) {
          required.push(param.name);
        }
      });
      
      openApiOperation.requestBody = {
        required: required.length > 0,
        content: {
          [contentType]: {
            schema: {
              type: 'object',
              properties,
              required: required.length > 0 ? required : undefined
            }
          }
        }
      };
    }
  }
  
  // Convert responses
  if (operation.responses) {
    for (const [statusCode, response] of Object.entries(operation.responses)) {
      openApiOperation.responses[statusCode] = {
        description: response.description || ''
      };
      
      if (response.schema) {
        // Determine content types from operation or global produces
        const contentTypes = operation.produces || globalProduces;
        
        openApiOperation.responses[statusCode].content = {};
        
        contentTypes.forEach((contentType: string) => {
          openApiOperation.responses[statusCode].content[contentType] = {
            schema: response.schema
          };
        });
      }
    }
  }
  
  return openApiOperation;
}

// Convert OpenAPI security scheme to Swagger security definition
function convertSecurityScheme(scheme: any): any {
  const result: any = {
    type: scheme.type,
  };
  
  switch (scheme.type) {
    case 'http':
      if (scheme.scheme === 'basic') {
        result.type = 'basic';
      } else if (scheme.scheme === 'bearer') {
        result.type = 'apiKey';
        result.name = 'Authorization';
        result.in = 'header';
        result.description = 'Bearer authentication. Example: "Bearer {token}"';
      }
      break;
    case 'apiKey':
      result.name = scheme.name;
      result.in = scheme.in;
      break;
    case 'oauth2':
      result.type = 'oauth2';
      
      // Handle the different oauth2 flows
      if (scheme.flows.implicit) {
        result.flow = 'implicit';
        result.authorizationUrl = scheme.flows.implicit.authorizationUrl;
        result.scopes = scheme.flows.implicit.scopes || {};
      } else if (scheme.flows.password) {
        result.flow = 'password';
        result.tokenUrl = scheme.flows.password.tokenUrl;
        result.scopes = scheme.flows.password.scopes || {};
      } else if (scheme.flows.clientCredentials) {
        result.flow = 'application';
        result.tokenUrl = scheme.flows.clientCredentials.tokenUrl;
        result.scopes = scheme.flows.clientCredentials.scopes || {};
      } else if (scheme.flows.authorizationCode) {
        result.flow = 'accessCode';
        result.authorizationUrl = scheme.flows.authorizationCode.authorizationUrl;
        result.tokenUrl = scheme.flows.authorizationCode.tokenUrl;
        result.scopes = scheme.flows.authorizationCode.scopes || {};
      }
      break;
    case 'openIdConnect':
      // OpenID Connect doesn't map cleanly to Swagger 2.0
      result.type = 'oauth2';
      result.flow = 'implicit';
      result.scopes = {};
      result.description = 'OpenID Connect (OIDC) authentication. See documentation for details.';
      break;
  }
  
  if (scheme.description) {
    result.description = scheme.description;
  }
  
  return result;
}

// Convert Swagger security definition to OpenAPI security scheme
function convertSecurityDefinitionToScheme(definition: any): any {
  const result: any = {
    type: definition.type,
    description: definition.description
  };
  
  switch (definition.type) {
    case 'basic':
      result.type = 'http';
      result.scheme = 'basic';
      break;
    case 'apiKey':
      result.in = definition.in;
      result.name = definition.name;
      break;
    case 'oauth2':
      result.type = 'oauth2';
      result.flows = {};
      
      // Map OAuth flows based on the flow type
      if (definition.flow === 'implicit') {
        result.flows.implicit = {
          authorizationUrl: definition.authorizationUrl,
          scopes: definition.scopes || {}
        };
      } else if (definition.flow === 'password') {
        result.flows.password = {
          tokenUrl: definition.tokenUrl,
          scopes: definition.scopes || {}
        };
      } else if (definition.flow === 'application') {
        result.flows.clientCredentials = {
          tokenUrl: definition.tokenUrl,
          scopes: definition.scopes || {}
        };
      } else if (definition.flow === 'accessCode') {
        result.flows.authorizationCode = {
          authorizationUrl: definition.authorizationUrl,
          tokenUrl: definition.tokenUrl,
          scopes: definition.scopes || {}
        };
      }
      break;
  }
  
  return result;
}

// Convert OpenAPI operation to Swagger operation
function convertOperation(operation: OpenAPIOperation): any {
  const result: any = {
    summary: operation.summary,
    description: operation.description,
    operationId: operation.operationId,
    tags: operation.tags,
    responses: {},
  };
  
  // Preserve security requirements if present
  if (operation.security) {
    result.security = operation.security;
  }
  
  // Convert parameters
  if (operation.parameters) {
    result.parameters = convertParameters(operation.parameters);
  }
  
  // Convert requestBody to parameter
  if (operation.requestBody) {
    const bodyParam: any = {
      name: 'body',
      in: 'body',
      required: operation.requestBody.required,
      description: operation.requestBody.description
    };
    
    if (operation.requestBody.content) {
      // Prefer application/json, but fall back to first available format
      const contentType = operation.requestBody.content['application/json'] 
        ? 'application/json' 
        : Object.keys(operation.requestBody.content)[0];
        
      if (contentType) {
        bodyParam.schema = operation.requestBody.content[contentType].schema;
      }
    }
    
    if (!result.parameters) {
      result.parameters = [];
    }
    
    result.parameters.push(bodyParam);
  }
  
  // Convert responses
  if (operation.responses) {
    for (const [code, response] of Object.entries(operation.responses)) {
      result.responses[code] = {
        description: response.description || '',
      };
      
      if (response.content) {
        // Prefer application/json, but fall back to first available format
        const contentType = response.content['application/json'] 
          ? 'application/json' 
          : Object.keys(response.content)[0];
          
        if (contentType && response.content[contentType].schema) {
          result.responses[code].schema = response.content[contentType].schema;
        }
      }
    }
  }
  
  return result;
}

// General converter function that can handle both directions
export function convertSpecification(yamlContent: string, direction: ConversionDirection): { content: string; warnings: string[] } {
  if (direction === ConversionDirection.OPENAPI_TO_SWAGGER) {
    return convertOpenApiToSwagger(yamlContent);
  } else {
    return convertSwaggerToOpenApi(yamlContent);
  }
}

// Validate if a string is a valid YAML
export function isValidYaml(content: string): boolean {
  try {
    yaml.load(content);
    return true;
  } catch (e) {
    return false;
  }
}

// Validate if a string is a valid JSON
export function isValidJson(content: string): boolean {
  try {
    JSON.parse(content);
    return true;
  } catch (e) {
    return false;
  }
}

// Validate if an object is an OpenAPI 3.x specification
export function isOpenApi3(obj: any): boolean {
  return obj && obj.openapi && typeof obj.openapi === 'string' && obj.openapi.startsWith('3.');
}

// Validate if an object is a Swagger 2.0 specification
export function isSwagger2(obj: any): boolean {
  return obj && obj.swagger && obj.swagger === '2.0';
}

// Detect API specification type
export function detectSpecType(content: string): 'openapi3' | 'swagger2' | 'unknown' {
  try {
    const parsed = yaml.load(content) as any;
    
    if (isOpenApi3(parsed)) {
      return 'openapi3';
    } else if (isSwagger2(parsed)) {
      return 'swagger2';
    } else {
      return 'unknown';
    }
  } catch (e) {
    return 'unknown';
  }
}
