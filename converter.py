import yaml
from enum import Enum
from urllib.parse import urlparse
from typing import Dict, List, Any, Tuple, Optional, Union


# Enum for conversion directions
class ConversionDirection(str, Enum):
    OPENAPI_TO_SWAGGER = 'openapi-to-swagger'
    SWAGGER_TO_OPENAPI = 'swagger-to-openapi'


# Detect OpenAPI 3.x features that aren't fully supported in Swagger 2.0
def detect_unsupported_features(openapi_spec: Dict[str, Any]) -> List[str]:
    warnings = []
    
    # Check for callbacks (not supported in Swagger 2.0)
    if openapi_spec.get('components', {}).get('callbacks'):
        warnings.append('Callbacks are not supported in Swagger 2.0 and will be removed.')
    
    # Check for links (not supported in Swagger 2.0)
    if openapi_spec.get('components', {}).get('links'):
        warnings.append('Links are not supported in Swagger 2.0 and will be removed.')
    
    # Check for oneOf, anyOf, allOf in schemas
    if openapi_spec.get('components', {}).get('schemas'):
        schemas = list(openapi_spec['components']['schemas'].values())
        
        for schema in schemas:
            if schema.get('oneOf'):
                warnings.append('oneOf schemas will be simplified to the first schema in the list.')
            if schema.get('anyOf'):
                warnings.append('anyOf schemas will be simplified to the first schema in the list.')
    
    # Check for multiple content types in request bodies
    if openapi_spec.get('paths'):
        for path, path_item in openapi_spec['paths'].items():
            for method, operation in path_item.items():
                if method in ('parameters', '$ref'):
                    continue
                
                if (operation.get('requestBody', {}).get('content') and 
                        len(operation['requestBody']['content']) > 1):
                    warnings.append(f"Multiple request content types in {method.upper()} {path} will be consolidated to a single schema.")
                
                # Check for responses with multiple content types
                if operation.get('responses'):
                    for status_code, response in operation['responses'].items():
                        if response.get('content') and len(response['content']) > 1:
                            warnings.append(f"Multiple response content types for status {status_code} in {method.upper()} {path} will be consolidated.")
    
    # Check for multiple servers
    if openapi_spec.get('servers') and len(openapi_spec['servers']) > 1:
        warnings.append('Multiple servers defined. Only the first one will be used in the converted Swagger 2.0 specification.')
    
    # Check for cookie parameters
    has_cookie_params = False
    if openapi_spec.get('paths'):
        for path_item in openapi_spec['paths'].values():
            for method, operation in path_item.items():
                if method in ('parameters', '$ref'):
                    continue
                
                if operation.get('parameters'):
                    for param in operation['parameters']:
                        if param.get('in') == 'cookie':
                            has_cookie_params = True
                            break
            
            if has_cookie_params:
                break
    
    if has_cookie_params:
        warnings.append('Cookie parameters are not supported in Swagger 2.0 and will be converted to header parameters.')
    
    return warnings


# Detect Swagger 2.0 features that aren't fully supported in OpenAPI 3.x
def detect_swagger_unsupported_features(swagger_spec: Dict[str, Any]) -> List[str]:
    warnings = []
    
    # Check for multiple produces/consumes at the global level
    if swagger_spec.get('produces') and len(swagger_spec['produces']) > 1:
        warnings.append('Multiple global "produces" values will be converted to individual response content types in OpenAPI 3.x.')
    
    if swagger_spec.get('consumes') and len(swagger_spec['consumes']) > 1:
        warnings.append('Multiple global "consumes" values will be converted to individual request content types in OpenAPI 3.x.')
    
    # Check for specific parameter formats
    if swagger_spec.get('paths'):
        for path, path_item in swagger_spec['paths'].items():
            for method, operation in path_item.items():
                if method == 'parameters':
                    continue
                
                # Check for formData parameters
                has_form_data = any(param.get('in') == 'formData' for param in operation.get('parameters', []))
                if has_form_data:
                    warnings.append(f"formData parameters in {method.upper()} {path} will be converted to requestBody with content type application/x-www-form-urlencoded or multipart/form-data.")
                
                # Check for body parameters with non-JSON content types
                body_params = [param for param in operation.get('parameters', []) if param.get('in') == 'body']
                if (body_params and 
                        (not swagger_spec.get('consumes') or 'application/json' not in swagger_spec['consumes'])):
                    warnings.append(f"Body parameters in {method.upper()} {path} with non-JSON content types will be converted to appropriate request body media types.")
    
    return warnings


# Convert OpenAPI 3.x to Swagger 2.0
def convert_openapi_to_swagger(yaml_content: str) -> Dict[str, Any]:
    try:
        # Parse the YAML content to Python dictionary
        openapi_spec = yaml.safe_load(yaml_content)
        
        # Validate if it's an OpenAPI spec
        if not openapi_spec.get('openapi') or not openapi_spec['openapi'].startswith('3.'):
            raise ValueError('The provided file is not a valid OpenAPI 3.x specification')
        
        # Detect unsupported features and generate warnings
        warnings = detect_unsupported_features(openapi_spec)
        
        # Create base Swagger 2.0 structure
        swagger_spec = {
            'swagger': '2.0',
            'info': openapi_spec['info'],
            'host': '',
            'basePath': '/',
            'schemes': ['https'],
            'consumes': ['application/json'],
            'produces': ['application/json'],
            'paths': {},
            'definitions': {},
            'securityDefinitions': {}
        }
        
        # Extract host and basePath from servers if available
        if openapi_spec.get('servers') and len(openapi_spec['servers']) > 0:
            server_url = urlparse(openapi_spec['servers'][0]['url'])
            swagger_spec['host'] = server_url.netloc
            swagger_spec['basePath'] = server_url.path or '/'
            
            if server_url.scheme:
                swagger_spec['schemes'] = [server_url.scheme]
        
        # Convert components/schemas to definitions
        if openapi_spec.get('components', {}).get('schemas'):
            swagger_spec['definitions'] = openapi_spec['components']['schemas']
        
        # Convert security schemes
        if openapi_spec.get('components', {}).get('securitySchemes'):
            for key, scheme in openapi_spec['components']['securitySchemes'].items():
                swagger_spec['securityDefinitions'][key] = convert_security_scheme(scheme)
        
        # Convert paths
        if openapi_spec.get('paths'):
            for path, path_item in openapi_spec['paths'].items():
                swagger_spec['paths'][path] = {}
                swagger_path = swagger_spec['paths'][path]
                
                for method, operation in path_item.items():
                    if method in ('parameters', '$ref'):
                        continue
                    
                    swagger_path[method] = convert_operation(operation)
        
        # Convert to YAML
        return {
            'content': yaml.dump(swagger_spec),
            'warnings': warnings
        }
    except Exception as error:
        print(f'Conversion error: {error}')
        raise


# Build server URL from Swagger spec
def build_server_url(swagger_spec: Dict[str, Any]) -> str:
    scheme = swagger_spec.get('schemes', ['https'])[0] if swagger_spec.get('schemes') else 'https'
    host = swagger_spec.get('host', 'example.com')
    base_path = swagger_spec.get('basePath', '/')
    
    return f"{scheme}://{host}{base_path}"


# Convert Swagger 2.0 to OpenAPI 3.x
def convert_swagger_to_openapi(yaml_content: str) -> Dict[str, Any]:
    try:
        # Parse the YAML content to Python dictionary
        swagger_spec = yaml.safe_load(yaml_content)
        
        # Validate if it's a Swagger spec
        if not swagger_spec.get('swagger') or swagger_spec['swagger'] != '2.0':
            raise ValueError('The provided file is not a valid Swagger 2.0 specification')
        
        # Detect unsupported features and generate warnings
        warnings = detect_swagger_unsupported_features(swagger_spec)
        
        # Create base OpenAPI 3.0 structure
        openapi_spec = {
            'openapi': '3.0.0',
            'info': swagger_spec['info'],
            'paths': {},
            'components': {
                'schemas': {},
                'securitySchemes': {}
            }
        }
        
        # Convert host, basePath, and schemes to servers
        server_url = build_server_url(swagger_spec)
        openapi_spec['servers'] = [{'url': server_url}]
        
        # Convert definitions to components/schemas
        if swagger_spec.get('definitions'):
            openapi_spec['components']['schemas'] = swagger_spec['definitions']
        
        # Convert security definitions
        if swagger_spec.get('securityDefinitions'):
            for key, definition in swagger_spec['securityDefinitions'].items():
                openapi_spec['components']['securitySchemes'][key] = convert_security_definition_to_scheme(definition)
        
        # Convert paths
        if swagger_spec.get('paths'):
            for path, path_item in swagger_spec['paths'].items():
                openapi_spec['paths'][path] = {}
                openapi_path = openapi_spec['paths'][path]
                
                for method, operation in path_item.items():
                    if method == 'parameters':
                        continue
                    
                    openapi_path[method] = convert_swagger_operation_to_openapi(
                        operation,
                        swagger_spec.get('consumes', ['application/json']),
                        swagger_spec.get('produces', ['application/json'])
                    )
        
        # Convert to YAML
        return {
            'content': yaml.dump(openapi_spec),
            'warnings': warnings
        }
    except Exception as error:
        print(f'Conversion error: {error}')
        raise


# Convert Swagger operation to OpenAPI operation
def convert_swagger_operation_to_openapi(operation: Dict[str, Any], 
                                         global_consumes: List[str], 
                                         global_produces: List[str]) -> Dict[str, Any]:
    openapi_operation = {
        'summary': operation.get('summary'),
        'description': operation.get('description'),
        'operationId': operation.get('operationId'),
        'tags': operation.get('tags'),
        'responses': {}
    }
    
    # Clean up None values
    openapi_operation = {k: v for k, v in openapi_operation.items() if v is not None}
    
    # Handle parameters
    if operation.get('parameters'):
        body_params = [p for p in operation['parameters'] if p.get('in') == 'body']
        form_data_params = [p for p in operation['parameters'] if p.get('in') == 'formData']
        other_params = [p for p in operation['parameters'] if p.get('in') not in ('body', 'formData')]
        
        # Handle regular parameters
        if other_params:
            openapi_operation['parameters'] = []
            for p in other_params:
                # Clone the parameter to avoid mutating the original
                new_param = p.copy()
                
                # Handle required field
                if 'required' not in new_param:
                    new_param['required'] = False
                
                openapi_operation['parameters'].append(new_param)
        
        # Handle body parameter - convert to requestBody
        if body_params:
            body_param = body_params[0]  # Swagger only allows one body parameter
            
            openapi_operation['requestBody'] = {
                'description': body_param.get('description'),
                'required': bool(body_param.get('required')),
                'content': {}
            }
            
            # Clean up None values
            openapi_operation['requestBody'] = {k: v for k, v in openapi_operation['requestBody'].items() if v is not None}
            
            # Determine content types from operation or global consumes
            content_types = operation.get('consumes', global_consumes)
            
            for content_type in content_types:
                openapi_operation['requestBody']['content'][content_type] = {
                    'schema': body_param.get('schema', {})
                }
        
        # Handle formData parameters - convert to requestBody
        if form_data_params:
            content_type = 'multipart/form-data' if any(p.get('type') == 'file' for p in form_data_params) else 'application/x-www-form-urlencoded'
            
            properties = {}
            required = []
            
            for param in form_data_params:
                properties[param['name']] = {
                    'type': param.get('type'),
                    'description': param.get('description')
                }
                
                # Clean up None values
                properties[param['name']] = {k: v for k, v in properties[param['name']].items() if v is not None}
                
                if param.get('required'):
                    required.append(param['name'])
            
            schema = {
                'type': 'object',
                'properties': properties
            }
            
            if required:
                schema['required'] = required
            
            openapi_operation['requestBody'] = {
                'required': bool(required),
                'content': {
                    content_type: {
                        'schema': schema
                    }
                }
            }
    
    # Convert responses
    if operation.get('responses'):
        for status_code, response in operation['responses'].items():
            openapi_operation['responses'][status_code] = {
                'description': response.get('description', '')
            }
            
            if response.get('schema'):
                # Determine content types from operation or global produces
                content_types = operation.get('produces', global_produces)
                
                openapi_operation['responses'][status_code]['content'] = {}
                
                for content_type in content_types:
                    openapi_operation['responses'][status_code]['content'][content_type] = {
                        'schema': response['schema']
                    }
    
    return openapi_operation


# Convert OpenAPI security scheme to Swagger security definition
def convert_security_scheme(scheme: Dict[str, Any]) -> Dict[str, Any]:
    result = {
        'type': scheme.get('type'),
    }
    
    if scheme.get('type') == 'http':
        if scheme.get('scheme') == 'basic':
            result['type'] = 'basic'
        elif scheme.get('scheme') == 'bearer':
            result['type'] = 'apiKey'
            result['name'] = 'Authorization'
            result['in'] = 'header'
    elif scheme.get('type') == 'apiKey':
        result['name'] = scheme.get('name')
        result['in'] = scheme.get('in')
    elif scheme.get('type') == 'oauth2':
        result['flow'] = 'implicit'
        result['scopes'] = scheme.get('flows', {}).get('implicit', {}).get('scopes', {})
        if scheme.get('flows', {}).get('implicit', {}).get('authorizationUrl'):
            result['authorizationUrl'] = scheme['flows']['implicit']['authorizationUrl']
    
    if scheme.get('description'):
        result['description'] = scheme['description']
    
    # Clean up None values
    result = {k: v for k, v in result.items() if v is not None}
    
    return result


# Convert Swagger security definition to OpenAPI security scheme
def convert_security_definition_to_scheme(definition: Dict[str, Any]) -> Dict[str, Any]:
    result = {
        'type': definition.get('type'),
        'description': definition.get('description')
    }
    
    # Clean up None values
    result = {k: v for k, v in result.items() if v is not None}
    
    if definition.get('type') == 'basic':
        result['type'] = 'http'
        result['scheme'] = 'basic'
    elif definition.get('type') == 'apiKey':
        result['in'] = definition.get('in')
        result['name'] = definition.get('name')
    elif definition.get('type') == 'oauth2':
        result['type'] = 'oauth2'
        result['flows'] = {}
        
        # Map OAuth flows based on the flow type
        if definition.get('flow') == 'implicit':
            result['flows']['implicit'] = {
                'authorizationUrl': definition.get('authorizationUrl'),
                'scopes': definition.get('scopes', {})
            }
        elif definition.get('flow') == 'password':
            result['flows']['password'] = {
                'tokenUrl': definition.get('tokenUrl'),
                'scopes': definition.get('scopes', {})
            }
        elif definition.get('flow') == 'application':
            result['flows']['clientCredentials'] = {
                'tokenUrl': definition.get('tokenUrl'),
                'scopes': definition.get('scopes', {})
            }
        elif definition.get('flow') == 'accessCode':
            result['flows']['authorizationCode'] = {
                'authorizationUrl': definition.get('authorizationUrl'),
                'tokenUrl': definition.get('tokenUrl'),
                'scopes': definition.get('scopes', {})
            }
    
    return result


# Convert OpenAPI operation to Swagger operation
def convert_operation(operation: Dict[str, Any]) -> Dict[str, Any]:
    result = {
        'summary': operation.get('summary'),
        'description': operation.get('description'),
        'operationId': operation.get('operationId'),
        'tags': operation.get('tags'),
        'responses': {},
    }
    
    # Clean up None values
    result = {k: v for k, v in result.items() if v is not None}
    
    # Convert parameters
    if operation.get('parameters'):
        result['parameters'] = []
        for param in operation['parameters']:
            converted = {
                'name': param.get('name'),
                'in': 'header' if param.get('in') == 'cookie' else param.get('in'),  # Convert cookie params to header
                'description': param.get('description'),
                'required': param.get('required'),
            }
            
            # Handle schema
            if param.get('schema'):
                if param['schema'].get('$ref'):
                    converted['schema'] = param['schema']
                else:
                    converted['type'] = param['schema'].get('type')
                    
                    if param['schema'].get('items'):
                        converted['items'] = param['schema']['items']
                    
                    if param['schema'].get('enum'):
                        converted['enum'] = param['schema']['enum']
            
            # Clean up None values
            converted = {k: v for k, v in converted.items() if v is not None}
            
            result['parameters'].append(converted)
    
    # Convert requestBody to parameter
    if operation.get('requestBody'):
        body_param = {
            'name': 'body',
            'in': 'body',
            'required': operation['requestBody'].get('required', False),
        }
        
        if operation['requestBody'].get('description'):
            body_param['description'] = operation['requestBody']['description']
        
        if operation['requestBody'].get('content', {}).get('application/json', {}).get('schema'):
            body_param['schema'] = operation['requestBody']['content']['application/json']['schema']
        elif operation['requestBody'].get('content'):
            # If application/json is not available, use the first content type
            first_content_type = next(iter(operation['requestBody']['content']), None)
            if first_content_type:
                body_param['schema'] = operation['requestBody']['content'][first_content_type]['schema']
        
        if 'parameters' not in result:
            result['parameters'] = []
        
        result['parameters'].append(body_param)
    
    # Convert responses
    if operation.get('responses'):
        for code, response in operation['responses'].items():
            result['responses'][code] = {
                'description': response.get('description', ''),
            }
            
            if response.get('content'):
                # Prefer application/json, but fall back to first available format
                content_type = None
                if 'application/json' in response['content']:
                    content_type = 'application/json'
                else:
                    content_type = next(iter(response['content']), None)
                    
                if content_type and response['content'][content_type].get('schema'):
                    result['responses'][code]['schema'] = response['content'][content_type]['schema']
    
    return result


# General converter function that can handle both directions
def convert_specification(yaml_content: str, direction: ConversionDirection) -> Dict[str, Any]:
    if direction == ConversionDirection.OPENAPI_TO_SWAGGER:
        return convert_openapi_to_swagger(yaml_content)
    else:
        return convert_swagger_to_openapi(yaml_content)


# Validate if a string is a valid YAML
def is_valid_yaml(content: str) -> bool:
    try:
        yaml.safe_load(content)
        return True
    except Exception:
        return False


# Validate if a string is a valid JSON
def is_valid_json(content: str) -> bool:
    try:
        import json
        json.loads(content)
        return True
    except Exception:
        return False


# Validate if an object is an OpenAPI 3.x specification
def is_openapi3(obj: Any) -> bool:
    return obj and obj.get('openapi') and isinstance(obj['openapi'], str) and obj['openapi'].startswith('3.')


# Validate if an object is a Swagger 2.0 specification
def is_swagger2(obj: Any) -> bool:
    return obj and obj.get('swagger') and obj['swagger'] == '2.0'


# Detect API specification type
def detect_spec_type(content: str) -> str:
    try:
        parsed = yaml.safe_load(content)
        
        if is_openapi3(parsed):
            return 'openapi3'
        elif is_swagger2(parsed):
            return 'swagger2'
        else:
            return 'unknown'
    except Exception:
        return 'unknown' 