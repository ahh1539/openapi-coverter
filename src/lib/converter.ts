
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

// Helper function to check if an enum contains invalid values
function hasInvalidEnumValues(schema: any): boolean {
  if (!schema || !schema.enum || !Array.isArray(schema.enum)) {
    return false;
  }

  // For arrays, enum values must be primitives or null
  if (schema.type === 'array') {
    return schema.enum.some((item: any) => 
      Array.isArray(item) || (typeof item === 'object' && item !== null));
  }

  // For objects, enum values must be primitives or null
  if (schema.type === 'object') {
    return schema.enum.some((item: any) => 
      typeof item === 'object' && item !== null);
  }

  // For other types, enum values should match the type
  return false;
}

// Helper function to simplify an invalid enum schema
function simplifyInvalidEnumSchema(schema: any): any {
  const simplified = { ...schema };
  
  // Save the original enum for documentation purposes
  const originalEnum = JSON.stringify(schema.enum);
  delete simplified.enum;
  
  // Add descriptive information about the simplification
  simplified.description = (simplified.description || '') + 
    ` (Simplified from a schema with complex enum values: ${originalEnum}. Original enum values cannot be directly represented in Swagger 2.0.)`;
  
  return simplified;
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
      // Check for invalid enum structures
      else if (key === 'enum' && hasInvalidEnumValues(obj)) {
        // This will be handled by the parent object
        continue;
      }
      // Handle anyOf (not supported in Swagger 2.0)
      else if (key === 'anyOf' || key === 'oneOf') {
        // Check for nullable case first
        const schemas = value as any[];
        const nonNullSchemas = schemas.filter(schema => !schema.type || schema.type !== 'null');
        const hasNullType = schemas.some(schema => schema.type === 'null');
        
        if (nonNullSchemas.length === 1 && hasNullType) {
          // Simple nullable case: use the non-null schema with x-nullable: true
          const nonNullSchema = nonNullSchemas[0];
          
          // Apply the non-null schema properties directly to the parent
          Object.entries(nonNullSchema).forEach(([k, v]) => {
            result[k] = fixSwagger2References(v);
          });
          
          // Add x-nullable to indicate nullable property
          result['x-nullable'] = true;
          
          // For boolean types, ensure we keep the type as boolean, not string
          if (nonNullSchema.type === 'boolean') {
            result.type = 'boolean';
          }
        } 
        else if (nonNullSchemas.length > 0) {
          // Multiple non-null schemas - choose based on user preference and specific rules
          let chosenSchema: any;

          const hasRef = nonNullSchemas.some(s => s.$ref);
          const hasString = nonNullSchemas.some(s => s.type === 'string');
          const hasInteger = nonNullSchemas.some(s => s.type === 'integer');
          // const hasBoolean = nonNullSchemas.some(s => s.type === 'boolean'); // Not currently needed for specific rules

          // Rule 1: Prioritize $ref if present with string (for BestCardRequest.spend_category)
          // Check if exactly two schemas, one is $ref, one is string
          if (nonNullSchemas.length === 2 && hasRef && hasString) {
              chosenSchema = nonNullSchemas.find(s => s.$ref);
          }
          // Rule 2: Prioritize string if present with integer (for ValidationError.loc.items)
          // Check if exactly two schemas, one is string, one is integer
          else if (nonNullSchemas.length === 2 && hasString && hasInteger) {
              chosenSchema = nonNullSchemas.find(s => s.type === 'string');
          }
          // Fallback: Use the first schema based on preferred type order
          else {
              // Corrected preference order: boolean > string > integer > number > array > object
              const preferredTypeOrders = ['boolean', 'string', 'integer', 'number', 'array', 'object'];
              const sortedSchemas = [...nonNullSchemas].sort((a, b) => {
                  const aTypeIndex = a.type ? preferredTypeOrders.indexOf(a.type) : Infinity;
                  const bTypeIndex = b.type ? preferredTypeOrders.indexOf(b.type) : Infinity;
                  // If types are the same or one is missing, don't change order arbitrarily
                  if (aTypeIndex === bTypeIndex) return 0;
                  return aTypeIndex - bTypeIndex;
              });
              // Ensure we pick one if sorting fails or array empty/invalid
              chosenSchema = sortedSchemas[0] || nonNullSchemas[0];
          }

          // Ensure chosenSchema is defined before proceeding
          if (!chosenSchema) {
             // Handle error or default case, e.g., fallback to generic object
             result.type = 'object';
             result.description = (result.description || '') +
               ` (Simplified from a complex ${key} structure that couldn't be mapped to a specific type in Swagger 2.0.)`;
             // Add x-nullable if null was an option, even in fallback
             if (hasNullType) {
               result['x-nullable'] = true;
             }
          } else {
            // Apply the chosen schema properties to the parent
            Object.entries(chosenSchema).forEach(([k, v]) => {
              // Explicitly fix $ref path before assigning
              if (k === '$ref' && typeof v === 'string') {
                result[k] = v.replace('#/components/schemas/', '#/definitions/');
              }
              // Avoid infinite recursion if chosenSchema contains the key itself (e.g., description)
              // Also prevent overwriting existing properties like 'description' added by simplification logic
              else if (k !== key && !(k in result)) {
                  result[k] = fixSwagger2References(v);
              } else if (k === 'description' && result.description && typeof v === 'string') {
                  // Append descriptions if both exist and aren't the simplification message
                  if (!result.description.includes('Simplified from a complex')) {
                    result.description += ` | From ${key}: ${fixSwagger2References(v)}`;
                  }
              } else if (!(k in result)) { // Only add if not already present
                  result[k] = fixSwagger2References(v);
              }
            });

            // Add description about this being a simplified representation, only if not already added
            const originalTypes = nonNullSchemas.map(s => s.type || (s.$ref ? 'reference type' : 'unspecified type')).join(', ');
            const simplificationMessage = ` (Simplified from a complex ${key} structure with multiple possible types: ${originalTypes}. Chosen representation may not capture all valid values.)`;
            // Check if the simplification message is already part of the description
            if (!result.description || !result.description.includes(simplificationMessage)) {
                result.description = (result.description || '') + simplificationMessage;
            }

            // Add x-nullable if null was an option
            if (hasNullType) {
              result['x-nullable'] = true;
            }
          }
        }
        else {
          // Fallback to generic object type if no clear schema found
          result.type = 'object';
          result.description = (result.description || '') + 
            ` (Simplified from a complex ${key} structure that couldn't be mapped to a specific type in Swagger 2.0.)`;
        }
      }
      // Handle allOf (partially supported in Swagger 2.0)
      else if (key === 'allOf') {
        // For allOf, attempt to merge schemas
        const mergedSchema: any = {};
        const refSchemas: any[] = [];
        
        // Separate $ref schemas from regular schemas
        for (const schema of (value as any[])) {
          if (schema.$ref) {
            // If it has a $ref, keep it in the allOf
            refSchemas.push(fixSwagger2References(schema));
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
        
        // If we have $ref schemas, keep them in allOf
        if (refSchemas.length > 0) {
          result.allOf = refSchemas;
        }
      }
      // Handle "not" schema (not supported in Swagger 2.0)
      else if (key === 'not') {
        // Cannot represent "not" in Swagger 2.0, add description
        result.description = (result.description || '') + 
          ' (Original schema contained "not" constraints that cannot be represented in Swagger 2.0.)';
        
        // Default to object type if no type specified
        if (!result.type) {
          result.type = 'object';
        }
      }
      // Check for invalid enum structures
      else if (hasInvalidEnumValues(obj)) {
        return simplifyInvalidEnumSchema(obj);
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
    // Clone the parameter to avoid mutating the original
    const newParam = { ...param };
    
    if (param.in && param.in !== 'body') {
      // Handle parameter with schema containing only a $ref
      if (param.schema && param.schema.$ref && Object.keys(param.schema).length === 1) {
        // Move the $ref directly to the parameter level
        newParam.$ref = param.schema.$ref.replace('#/components/schemas/', '#/definitions/');
        delete newParam.schema;
        return newParam;
      }
      
      // If we have a schema but no type, extract type from schema
      if (param.schema) {
        if (!param.schema.$ref) {
          // Extract schema properties to parameter level
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
          
          // Remove schema after extracting its properties
          delete newParam.schema;
        }
      }
      
      // Default to string type if still no type specified
      if (!newParam.$ref && !newParam.type) {
        newParam.type = 'string';
      }
      
      // Ensure array type has items
      if (newParam.type === 'array' && !newParam.items) {
        newParam.items = { type: 'string' };
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
        warnings.push(`oneOf in schema "${schemaName}" will be simplified to a single schema with x-nullable if null is an option.`);
      }
      if (schema.anyOf) {
        warnings.push(`anyOf in schema "${schemaName}" will be simplified to a single schema with x-nullable if null is an option.`);
      }
      if (schema.not) {
        warnings.push(`"not" keyword in schema "${schemaName}" is not supported in Swagger 2.0 and will be simplified.`);
      }
      if (hasInvalidEnumValues(schema)) {
        warnings.push(`Invalid enum values in schema "${schemaName}" will be simplified for Swagger 2.0 compatibility.`);
      }
    }
  }
  
  // Check for multiple content types in request bodies
  if (openApiSpec.paths) {
    for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
      // Cast to OpenAPIPathItem to access its properties safely
      const typedPathItem = pathItem as OpenAPIPathItem;
      
      // Check path parameters
      if (typedPathItem.parameters) {
        for (const param of typedPathItem.parameters) {
          if (param.in === 'cookie') {
            warnings.push(`Cookie parameter at path level for "${path}" will be converted to a header parameter.`);
          }
          // Check for parameters with schema containing only a $ref
          if (param.in && param.in !== 'body' && param.schema && param.schema.$ref && Object.keys(param.schema).length === 1) {
            warnings.push(`Parameter with schema containing only $ref at path level for "${path}" will have $ref moved to parameter level.`);
          }
        }
      }
      
      // Check operations
      for (const [method, operation] of Object.entries(typedPathItem)) {
        if (method === 'parameters' || method === '$ref' || !operation) continue;
        
        // Cast to OpenAPIOperation to access its properties safely
        const op = operation as OpenAPIOperation;
        
        // Check for operation parameters
        if (op.parameters) {
          for (const param of op.parameters) {
            if (param.in === 'cookie') {
              warnings.push(`Cookie parameter in ${method.toUpperCase()} ${path} will be converted to a header parameter.`);
            }
            if (param.in && param.in !== 'body' && param.schema && param.schema.$ref && Object.keys(param.schema).length === 1) {
              warnings.push(`Parameter with schema containing only $ref in ${method.toUpperCase()} ${path} will have $ref moved to parameter level.`);
            }
          }
        }
        
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
      // Cast to SwaggerPathItem to access its properties safely
      const typedPathItem = pathItem as SwaggerPathItem;
      
      // Check path parameters
      if (typedPathItem.parameters) {
        // Check for path-level parameters
      }
      
      // Check operations
      for (const [method, operation] of Object.entries(typedPathItem)) {
        if (method === 'parameters' || method === '$ref' || !operation) continue;
        
        // Cast to SwaggerOperation to access its properties safely
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
      // Check for and fix invalid enum structures in schemas before converting
      for (const [key, schema] of Object.entries(openApiSpec.components.schemas)) {
        if (hasInvalidEnumValues(schema)) {
          swaggerSpec.definitions[key] = simplifyInvalidEnumSchema(schema);
        } else {
          swaggerSpec.definitions[key] = schema;
        }
      }
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
        if ((pathItem as OpenAPIPathItem).parameters) {
          swaggerPath.parameters = convertParameters((pathItem as OpenAPIPathItem).parameters);
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
    
    // Final pass to ensure all parameters have types and handle direct $refs
    if (fixedSwaggerSpec.paths) {
      for (const [_, pathItem] of Object.entries(fixedSwaggerSpec.paths)) {
        // Fix path-level parameters
        if ((pathItem as SwaggerPathItem).parameters) {
          (pathItem as SwaggerPathItem).parameters = ensureParameterTypes((pathItem as SwaggerPathItem).parameters);
        }
        
        // Fix operation-level parameters
        for (const [method, operation] of Object.entries(pathItem as SwaggerPathItem)) {
          if (method === 'parameters' || method === '$ref' || !operation) continue;
          
          // Cast operation to SwaggerOperation to access parameters safely
          const op = operation as SwaggerOperation;
          if (op.parameters) {
            op.parameters = ensureParameterTypes(op.parameters);
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
    
    // Handle schema with only a $ref - move $ref directly to parameter level
    if (param.in !== 'body' && param.schema && param.schema.$ref && Object.keys(param.schema).length === 1) {
      return {
        ...param,
        $ref: param.schema.$ref.replace('#/components/schemas/', '#/definitions/'),
        schema: undefined
      };
    }
    
        // Handle 'schema' in non-body parameters (move properties up a level)
        if (param.in !== 'body' && param.schema) {
            const converted = { ...param };
            const schema = param.schema; // Use a shorter alias

            if (schema.$ref) {
                // If it's a reference, move it directly to the parameter level
                converted.$ref = schema.$ref.replace('#/components/schemas/', '#/definitions/');
                delete converted.schema;
            } else {
                // Extract schema properties to parameter level
                const schemaProps = ['type', 'format', 'enum', 'minimum', 'maximum',
                                   'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
                                   'minLength', 'maxLength', 'pattern', 'minItems',
                                   'maxItems', 'uniqueItems', 'default'];

                for (const prop of schemaProps) {
                    if (schema[prop] !== undefined) {
                        converted[prop] = schema[prop];
                    }
                }

                // Explicitly handle boolean type, especially if it came from anyOf[boolean, null]
                // The fixSwagger2References should have simplified this to type: 'boolean', nullable: true
                if (schema.type === 'boolean' || (schema.anyOf && schema.anyOf.some((s: any) => s.type === 'boolean') && schema.anyOf.some((s: any) => s.type === 'null'))) {
                    converted.type = 'boolean';
                    // Note: x-nullable is handled below based on schema.nullable
                }

                // Handle nullable by adding x-nullable extension (Swagger 2.0 way)
                // Or if it was simplified from anyOf[type, null] by fixSwagger2References
                if (schema.nullable === true || schema['x-nullable'] === true) {
                    // For non-body parameters, required: false implies nullable in Swagger 2.0
                    // So we don't strictly need x-nullable, but it can be kept for clarity if desired.
                    // Let's remove it for cleaner Swagger 2.0 unless strictly needed.
                    // converted['x-nullable'] = true; // Optional: keep for clarity
                    delete converted['x-nullable']; // Remove if present from simplification
                }

                // Handle array items
                if (schema.type === 'array' && schema.items) {
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
          if (method === 'parameters' || method === '$ref' || !operation) continue;
          
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
      // Handle direct $ref at parameter level
      if (param.$ref) {
        // Keep the $ref, but update to OpenAPI 3.0 format in fixOpenApiReferences
        return newParam;
      }
      
      // Move parameter-level type properties into a schema object
      if (param.type || param.format || param.items || param.enum) {
        newParam.schema = {
          type: param.type,
          format: param.format,
          enum: param.enum
        };
        
        // Handle x-nullable (convert to nullable: true in OpenAPI 3.0)
        if (param['x-nullable'] === true) {
          newParam.schema.nullable = true;
          delete newParam['x-nullable']; // Clean up Swagger 2.0 extension
        }

        // If the parameter is not required (and not 'in: body'), it's nullable in OpenAPI 3.0
        if (param.required === false) {
           newParam.schema.nullable = true;
        }
        
        // Handle array items
        if (param.type === 'array' && param.items) {
          newParam.schema.items = param.items;
        }
        
        // Clean up null/undefined values from the schema object
        newParam.schema = Object.fromEntries(
          Object.entries(newParam.schema).filter(([_, v]) => v !== undefined && v !== null)
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
