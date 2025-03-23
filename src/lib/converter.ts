
import * as yaml from 'js-yaml';

// Convert OpenAPI 3.x to Swagger 2.0
export function convertOpenApiToSwagger(yamlContent: string): string {
  try {
    // Parse the YAML content to JavaScript object
    const openApiSpec = yaml.load(yamlContent) as any;
    
    // Validate if it's an OpenAPI spec
    if (!openApiSpec.openapi || !openApiSpec.openapi.startsWith('3.')) {
      throw new Error('The provided file is not a valid OpenAPI 3.x specification');
    }
    
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
          
          swaggerPath[method] = convertOperation(operation as any);
        }
      }
    }
    
    // Convert to YAML
    return yaml.dump(swaggerSpec);
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
function convertOperation(operation: any): any {
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
        in: param.in,
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
        description: (response as any).description || '',
      };
      
      const responseObj = response as any;
      
      if (responseObj.content && responseObj.content['application/json'] && responseObj.content['application/json'].schema) {
        result.responses[code].schema = responseObj.content['application/json'].schema;
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

// Validate if an object is an OpenAPI 3.x specification
export function isOpenApi3(obj: any): boolean {
  return obj && obj.openapi && typeof obj.openapi === 'string' && obj.openapi.startsWith('3.');
}
