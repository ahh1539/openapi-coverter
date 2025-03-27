
import yaml
from enum import Enum
from urllib.parse import urlparse
from typing import Dict, List, Any, Tuple, Optional, Union


# Enum for conversion directions
class ConversionDirection(str, Enum):
    OPENAPI_TO_SWAGGER = 'openapi-to-swagger'
    SWAGGER_TO_OPENAPI = 'swagger-to-openapi'


# Helper function to fix $ref paths for Swagger 2.0
def fix_swagger2_references(obj: Any) -> Any:
    if obj is None:
        return None
    
    if isinstance(obj, dict):
        result = {}
        
        for key, value in obj.items():
            # Handle $ref specifically
            if key == '$ref' and isinstance(value, str):
                # Replace components/schemas with definitions
                result[key] = value.replace('#/components/schemas/', '#/definitions/')
            # Handle anyOf/oneOf (not supported in Swagger 2.0)
            elif key in ('anyOf', 'oneOf'):
                # Find if this is a nullable type pattern
                schemas = value
                non_null_schemas = [s for s in schemas if not s.get('type') == 'null']
                has_null_type = any(s.get('type') == 'null' for s in schemas)
                
                if len(non_null_schemas) == 1 and has_null_type:
                    # Simple nullable case: use the non-null schema and add x-nullable
                    non_null_schema = non_null_schemas[0]
                    for k, v in non_null_schema.items():
                        result[k] = fix_swagger2_references(v)
                    # Add x-nullable to indicate that null is allowed
                    result['x-nullable'] = True
                elif non_null_schemas:
                    # Multiple non-null schemas - pick one that's not 'object' if possible
                    most_specific = next((s for s in non_null_schemas if s.get('type') and s.get('type') != 'object'), 
                                       non_null_schemas[0])
                    
                    # Apply the chosen schema
                    for k, v in most_specific.items():
                        result[k] = fix_swagger2_references(v)
                    
                    # Add description to explain this is simplified
                    if 'description' not in result:
                        result['description'] = 'This is a simplified representation of a more complex type.'
                    elif 'simplified representation' not in result['description']:
                        result['description'] += ' (This is a simplified representation of a more complex type.)'
                    
                    # Add x-nullable if null was an option
                    if has_null_type:
                        result['x-nullable'] = True
                else:
                    # Fallback to generic object
                    result['type'] = 'object'
                    result['description'] = result.get('description', 'Complex type that requires custom validation.')
            # Handle allOf (partially supported)
            elif key == 'allOf':
                # Try to merge schemas (simplified approach)
                merged_schema = {}
                references = []
                
                # Process each schema in allOf
                for schema in value:
                    if '$ref' in schema:
                        # Keep references separate for allOf
                        references.append(fix_swagger2_references(schema))
                    else:
                        # For regular schemas, try to merge properties
                        for prop_key, prop_value in schema.items():
                            if prop_key == 'properties' and isinstance(prop_value, dict):
                                if 'properties' not in merged_schema:
                                    merged_schema['properties'] = {}
                                merged_schema['properties'].update(prop_value)
                            elif prop_key == 'required' and isinstance(prop_value, list):
                                if 'required' not in merged_schema:
                                    merged_schema['required'] = []
                                merged_schema['required'].extend(prop_value)
                            else:
                                # For other keys, just use the latest value
                                merged_schema[prop_key] = prop_value
                
                # Apply merged properties
                for k, v in merged_schema.items():
                    if k != 'allOf':  # Avoid circular reference
                        result[k] = fix_swagger2_references(v)
                
                # If we have references, keep allOf
                if references:
                    result['allOf'] = references
            # Handle 'not' schema (unsupported)
            elif key == 'not':
                # Can't represent "not" in Swagger 2.0
                if 'description' not in result:
                    result['description'] = ''
                
                if 'with exclusions' not in result.get('description', ''):
                    result['description'] += ' (Complex type with exclusions that cannot be fully represented in Swagger 2.0.)'
                
                # Default to object type if none specified
                if 'type' not in result:
                    result['type'] = 'object'
            # For all other properties, recurse
            else:
                result[key] = fix_swagger2_references(value)
        
        return result
    elif isinstance(obj, list):
        return [fix_swagger2_references(item) for item in obj]
    else:
        # Return primitives unchanged
        return obj


# Ensure all non-body parameters have a type
def ensure_parameter_types(parameters: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not parameters:
        return parameters
    
    result = []
    for param in parameters:
        new_param = param.copy()
        
        if param.get('in') != 'body':
            if not param.get('type') and not param.get('schema'):
                # Default to string if no type is specified
                new_param['type'] = 'string'
            
            # If we have a schema but no type, extract the type
            if param.get('schema') and not param.get('type'):
                if param['schema'].get('$ref'):
                    # If schema is a reference, we'll leave it as is for now
                    # (will be handled by fix_swagger2_references)
                    pass
                else:
                    # Extract schema properties up to parameter level
                    schema_props = ['type', 'format', 'enum', 'minimum', 'maximum', 
                                  'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
                                  'minLength', 'maxLength', 'pattern', 'minItems', 
                                  'maxItems', 'uniqueItems', 'default']
                    
                    for prop in schema_props:
                        if prop in param['schema']:
                            new_param[prop] = param['schema'][prop]
                    
                    # Handle array items
                    if param['schema'].get('type') == 'array' and param['schema'].get('items'):
                        new_param['items'] = param['schema']['items']
                    
                    # Remove schema after extraction
                    if 'schema' in new_param:
                        del new_param['schema']
        
        result.append(new_param)
    
    return result


# Convert parameters for OpenAPI to Swagger
def convert_parameters(parameters: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not parameters:
        return []
    
    converted = []
    for param in parameters:
        # Handle cookie parameters (not supported in Swagger 2.0)
        if param.get('in') == 'cookie':
            param = {**param, 'in': 'header'}
        
        # Handle schema in non-body parameters
        if param.get('in') != 'body' and param.get('schema'):
            converted_param = param.copy()
            
            if param['schema'].get('$ref'):
                # If it's a reference, keep the schema
                # (will be handled by fix_swagger2_references later)
                pass
            else:
                # Extract schema properties
                schema_props = ['type', 'format', 'enum', 'minimum', 'maximum',
                              'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
                              'minLength', 'maxLength', 'pattern', 'minItems',
                              'maxItems', 'uniqueItems', 'default']
                
                for prop in schema_props:
                    if prop in param['schema']:
                        converted_param[prop] = param['schema'][prop]
                
                # Handle array items
                if param['schema'].get('type') == 'array' and param['schema'].get('items'):
                    converted_param['items'] = param['schema']['items']
                    
                    # Swagger 2.0 requires 'items' for array types
                    if not converted_param.get('items'):
                        converted_param['items'] = {'type': 'string'}
                
                # Remove schema after extraction
                if 'schema' in converted_param:
                    del converted_param['schema']
            
            converted.append(converted_param)
        else:
            converted.append(param)
    
    # Ensure all parameters have types
    return ensure_parameter_types(converted)


# Detect OpenAPI 3.x features that aren't fully supported in Swagger 2.0
def detect_unsupported_features(openapi_spec: Dict[str, Any]) -> List[str]:
    warnings = []
    
    # Check for callbacks (not supported in Swagger 2.0)
    if openapi_spec.get('components', {}).get('callbacks'):
        warnings.append('Callbacks are not supported in Swagger 2.0 and will be removed.')
    
    # Check for links (not supported in Swagger 2.0)
    if openapi_spec.get('components', {}).get('links'):
        warnings.append('Links are not supported in Swagger 2.0 and will be removed.')
    
    # Check for oneOf, anyOf, not in schemas
    if openapi_spec.get('components', {}).get('schemas'):
        schemas = openapi_spec['components']['schemas']
        
        for schema_name, schema in schemas.items():
            if schema.get('oneOf'):
                warnings.append(f'oneOf in schema "{schema_name}" will be simplified to the first schema in the list with x-nullable if null is an option.')
            if schema.get('anyOf'):
                warnings.append(f'anyOf in schema "{schema_name}" will be simplified to the first schema in the list with x-nullable if null is an option.')
            if schema.get('not'):
                warnings.append(f'"not" keyword in schema "{schema_name}" is not supported in Swagger 2.0 and will be simplified.')
    
    # Check for multiple content types in request bodies
    if openapi_spec.get('paths'):
        for path, path_item in openapi_spec['paths'].items():
            for method, operation in path_item.items():
                if method in ('parameters', '$ref'):
                    continue
                
                request_body = operation.get('requestBody', {})
                if request_body.get('content') and len(request_body['content']) > 1:
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
        
        # Add global security if available
        if openapi_spec.get('security'):
            swagger_spec['security'] = openapi_spec['security']
        
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
                
                # Handle path-level parameters
                if path_item.get('parameters'):
                    swagger_path['parameters'] = convert_parameters(path_item['parameters'])
                
                for method, operation in path_item.items():
                    if method in ('parameters', '$ref'):
                        continue
                    
                    swagger_path[method] = convert_operation(operation)
                    
                    # Preserve operation-level security
                    if operation.get('security'):
                        swagger_path[method]['security'] = operation['security']
        
        # Fix all $ref paths and handle anyOf/oneOf
        fixed_swagger_spec = fix_swagger2_references(swagger_spec)
        
        # Final pass to ensure all parameters have types
        if fixed_swagger_spec.get('paths'):
            for path_item in fixed_swagger_spec['paths'].values():
                # Ensure path-level parameters have types
                if path_item.get('parameters'):
                    path_item['parameters'] = ensure_parameter_types(path_item['parameters'])
                
                # Ensure operation-level parameters have types
                for method, operation in path_item.items():
                    if method != 'parameters' and operation.get('parameters'):
                        operation['parameters'] = ensure_parameter_types(operation['parameters'])
        
        # Convert to YAML
        return {
            'content': yaml.dump(fixed_swagger_spec),
            'warnings': warnings
        }
    except Exception as error:
        print(f'Conversion error: {error}')
        raise


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
    
    # Handle security requirements
    if operation.get('security'):
        result['security'] = operation['security']
    
    # Convert parameters
    if operation.get('parameters'):
        result['parameters'] = convert_parameters(operation['parameters'])
    
    # Convert requestBody to parameter
    if operation.get('requestBody'):
        body_param = {
            'name': 'body',
            'in': 'body',
            'required': operation['requestBody'].get('required', False),
        }
        
        if operation['requestBody'].get('description'):
            body_param['description'] = operation['requestBody']['description']
        
        if operation['requestBody'].get('content'):
            # Prefer application/json, but fall back to the first content type
            content_type = 'application/json' if 'application/json' in operation['requestBody']['content'] else next(iter(operation['requestBody']['content']))
            
            if content_type:
                body_param['schema'] = operation['requestBody']['content'][content_type].get('schema', {})
        
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
                # Prefer application/json, but fall back to the first content type
                content_type = 'application/json' if 'application/json' in response['content'] else next(iter(response['content']), None)
                
                if content_type and response['content'][content_type].get('schema'):
                    result['responses'][code]['schema'] = response['content'][content_type]['schema']
    
    return result


# Convert OpenAPI security scheme to Swagger security definition
def convert_security_scheme(scheme: Dict[str, Any]) -> Dict[str, Any]:
    result = {
        'type': scheme.get('type'),
    }
    
    # Clean up None values
    result = {k: v for k, v in result.items() if v is not None}
    
    if scheme.get('type') == 'http':
        if scheme.get('scheme') == 'basic':
            result['type'] = 'basic'
        elif scheme.get('scheme') == 'bearer':
            result['type'] = 'apiKey'
            result['name'] = 'Authorization'
            result['in'] = 'header'
            result['description'] = 'Bearer authentication. Example: "Bearer {token}"'
    elif scheme.get('type') == 'apiKey':
        result['name'] = scheme.get('name')
        result['in'] = scheme.get('in')
    elif scheme.get('type') == 'oauth2':
        result['type'] = 'oauth2'
        
        # Handle the different oauth2 flows
        flows = scheme.get('flows', {})
        if flows.get('implicit'):
            result['flow'] = 'implicit'
            result['authorizationUrl'] = flows['implicit'].get('authorizationUrl')
            result['scopes'] = flows['implicit'].get('scopes', {})
        elif flows.get('password'):
            result['flow'] = 'password'
            result['tokenUrl'] = flows['password'].get('tokenUrl')
            result['scopes'] = flows['password'].get('scopes', {})
        elif flows.get('clientCredentials'):
            result['flow'] = 'application'
            result['tokenUrl'] = flows['clientCredentials'].get('tokenUrl')
            result['scopes'] = flows['clientCredentials'].get('scopes', {})
        elif flows.get('authorizationCode'):
            result['flow'] = 'accessCode'
            result['authorizationUrl'] = flows['authorizationCode'].get('authorizationUrl')
            result['tokenUrl'] = flows['authorizationCode'].get('tokenUrl')
            result['scopes'] = flows['authorizationCode'].get('scopes', {})
    elif scheme.get('type') == 'openIdConnect':
        # OpenID Connect doesn't map directly to Swagger 2.0
        result['type'] = 'oauth2'
        result['flow'] = 'implicit'
        result['scopes'] = {}
        result['description'] = 'OpenID Connect (OIDC) authentication. See documentation for details.'
    
    if scheme.get('description'):
        result['description'] = scheme['description']
    
    return result


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
        
        # Add global security if available
        if swagger_spec.get('security'):
            openapi_spec['security'] = swagger_spec['security']
        
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
                
                # Handle path-level parameters
                if path_item.get('parameters'):
                    openapi_path['parameters'] = convert_swagger_parameters_to_openapi(path_item['parameters'])
                
                for method, operation in path_item.items():
                    if method == 'parameters':
                        continue
                    
                    openapi_path[method] = convert_swagger_operation_to_openapi(
                        operation,
                        swagger_spec.get('consumes', ['application/json']),
                        swagger_spec.get('produces', ['application/json'])
                    )
                    
                    # Preserve operation-level security
                    if operation.get('security'):
                        openapi_path[method]['security'] = operation['security']
        
        # Fix references
        fix_openapi_references(openapi_spec)
        
        # Convert to YAML
        return {
            'content': yaml.dump(openapi_spec),
            'warnings': warnings
        }
    except Exception as error:
        print(f'Conversion error: {error}')
        raise


# Fix references in OpenAPI 3.0 spec
def fix_openapi_references(obj: Any) -> None:
    if not isinstance(obj, dict) and not isinstance(obj, list):
        return
    
    if isinstance(obj, list):
        for item in obj:
            fix_openapi_references(item)
        return
    
    for key, value in list(obj.items()):
        if key == '$ref' and isinstance(value, str):
            # Update #/definitions/ references to #/components/schemas/
            obj[key] = value.replace('#/definitions/', '#/components/schemas/')
        elif isinstance(value, (dict, list)):
            fix_openapi_references(value)


# Convert Swagger parameters to OpenAPI 3.0 format
def convert_swagger_parameters_to_openapi(parameters: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not parameters:
        return []
    
    result = []
    for param in parameters:
        # Clone to avoid mutating the original
        new_param = param.copy()
        
        # Convert non-body, non-formData parameters
        if param.get('in') not in ('body', 'formData'):
            # Move parameter-level type properties into a schema object
            if param.get('type') or param.get('format') or param.get('items') or param.get('enum'):
                new_param['schema'] = {
                    'type': param.get('type'),
                    'format': param.get('format'),
                    'enum': param.get('enum')
                }
                
                # Clean up None values
                new_param['schema'] = {k: v for k, v in new_param['schema'].items() if v is not None}
                
                # Handle array items
                if param.get('type') == 'array' and param.get('items'):
                    new_param['schema']['items'] = param['items']
                
                # Remove properties that are now in schema
                for prop in ('type', 'format', 'items', 'enum'):
                    if prop in new_param:
                        del new_param[prop]
        
        # Form and body params are handled separately in the operation conversion
        result.append(new_param)
    
    return result


# Convert Swagger operation to OpenAPI operation
def convert_swagger_operation_to_openapi(
    operation: Dict[str, Any], 
    global_consumes: List[str], 
    global_produces: List[str]
) -> Dict[str, Any]:
    # ... keep existing code (Swagger operation conversion)
    openapi_operation = {
        'summary': operation.get('summary'),
        'description': operation.get('description'),
        'operationId': operation.get('operationId'),
        'tags': operation.get('tags'),
        'responses': {}
    }
    
    # Clean up None values
    openapi_operation = {k: v for k, v in openapi_operation.items() if v is not None}
    
    # Handle security requirements
    if operation.get('security'):
        openapi_operation['security'] = operation['security']
    
    # Handle parameters
    if operation.get('parameters'):
        body_params = [p for p in operation['parameters'] if p.get('in') == 'body']
        form_data_params = [p for p in operation['parameters'] if p.get('in') == 'formData']
        other_params = [p for p in operation['parameters'] if p.get('in') not in ('body', 'formData')]
        
        # Handle regular parameters
        if other_params:
            openapi_operation['parameters'] = convert_swagger_parameters_to_openapi(other_params)
        
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
                
                # Handle array type
                if param.get('type') == 'array' and param.get('items'):
                    properties[param['name']]['items'] = param['items']
                
                # Handle enum
                if param.get('enum'):
                    properties[param['name']]['enum'] = param['enum']
                
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


# Convert Swagger security definition to OpenAPI security scheme
def convert_security_definition_to_scheme(definition: Dict[str, Any]) -> Dict[str, Any]:
    # ... keep existing code (security definition conversion)
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
