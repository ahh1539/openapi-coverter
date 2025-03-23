
import * as yaml from 'js-yaml';

// Define TypeScript interfaces for OpenAPI objects
interface OpenAPIOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
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
  paths?: Record<string, OpenAPIPathItem>;
  components?: {
    schemas?: Record<string, any>;
    securitySchemes?: Record<string, any>;
    callbacks?: any;
    links?: any;
  };
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
    const schemas = Object.values(openApiSpec.components.schemas) as any[];
    
    for (const schema of schemas) {
      if (schema.oneOf) {
        warnings.push('oneOf schemas will be simplified to the first schema in the list.');
      }
      if (schema.anyOf) {
        warnings.push('anyOf schemas will be simplified to the first schema in the list.');
      }
    }
  }
  
  // Check for multiple content types in request bodies
  if (openApiSpec.paths) {
    for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
      for (const [method, operation] of Object.entries(pathItem as any)) {
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
      for (const [method, operation] of Object.entries(pathItem as any)) {
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
        
        for (const [method, operation] of Object.entries(pathItem as any)) {
          if (method === 'parameters' || method === '$ref') continue;
          
          swaggerPath[method] = convertOperation(operation as OpenAPIOperation);
        }
      }
    }
    
    // Convert to YAML
    return { 
      content: yaml.dump(swaggerSpec),
      warnings 
    };
  } catch (error) {
    console.error('Conversion error:', error);
    throw error;
  }
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
      }
      break;
    case 'apiKey':
      result.name = scheme.name;
      result.in = scheme.in;
      break;
    case 'oauth2':
      result.flow = 'implicit';
      result.scopes = scheme.flows?.implicit?.scopes || {};
      if (scheme.flows?.implicit?.authorizationUrl) {
        result.authorizationUrl = scheme.flows.implicit.authorizationUrl;
      }
      break;
  }
  
  if (scheme.description) {
    result.description = scheme.description;
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
  
  // Convert parameters
  if (operation.parameters) {
    result.parameters = operation.parameters.map((param: any) => {
      const converted: any = {
        name: param.name,
        in: param.in === 'cookie' ? 'header' : param.in, // Convert cookie params to header
        description: param.description,
        required: param.required,
      };
      
      // Handle schema
      if (param.schema) {
        if (param.schema.$ref) {
          converted.schema = param.schema;
        } else {
          converted.type = param.schema.type;
          
          if (param.schema.items) {
            converted.items = param.schema.items;
          }
          
          if (param.schema.enum) {
            converted.enum = param.schema.enum;
          }
        }
      }
      
      return converted;
    });
  }
  
  // Convert requestBody to parameter
  if (operation.requestBody) {
    const bodyParam: any = {
      name: 'body',
      in: 'body',
      required: operation.requestBody.required,
    };
    
    if (operation.requestBody.description) {
      bodyParam.description = operation.requestBody.description;
    }
    
    if (operation.requestBody.content && operation.requestBody.content['application/json']) {
      bodyParam.schema = operation.requestBody.content['application/json'].schema;
    } else if (operation.requestBody.content) {
      // If application/json is not available, use the first content type
      const firstContentType = Object.keys(operation.requestBody.content)[0];
      if (firstContentType) {
        bodyParam.schema = operation.requestBody.content[firstContentType].schema;
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
