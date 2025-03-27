
import yaml
from converter import convert_specification, ConversionDirection

# --- Test OpenAPI 3.x to Swagger 2.0 ---
print("--- Testing OpenAPI 3.x to Swagger 2.0 ---")
try:
    with open('test_openapi3.yaml', 'r') as f:
        openapi_content = f.read()

    print("Input OpenAPI 3.x:")
    print(openapi_content)
    print("-" * 20)

    result_swagger = convert_specification(openapi_content, ConversionDirection.OPENAPI_TO_SWAGGER)

    print("Output Swagger 2.0:")
    print(result_swagger['content'])
    print("-" * 20)

    # Load the converted spec for analysis
    converted_spec = yaml.safe_load(result_swagger['content'])
    
    # Check for global security
    if 'security' in converted_spec:
        print("✅ Global security preserved in converted Swagger spec")
    else:
        print("❌ Global security missing in converted Swagger spec")
    
    # Check for operation-level security
    if 'paths' in converted_spec:
        for path, path_item in converted_spec['paths'].items():
            for method, operation in path_item.items():
                if 'security' in operation:
                    print(f"✅ Operation security preserved in {method.upper()} {path}")
                else:
                    print(f"❌ Security missing in {method.upper()} {path}")
    
    # Check for proper reference paths
    ref_paths_correct = True
    
    def check_refs(obj):
        nonlocal ref_paths_correct
        if isinstance(obj, dict):
            for key, value in obj.items():
                if key == '$ref' and isinstance(value, str):
                    if not value.startswith('#/definitions/'):
                        ref_paths_correct = False
                        print(f"❌ Invalid reference path found: {value}")
                elif isinstance(value, (dict, list)):
                    check_refs(value)
        elif isinstance(obj, list):
            for item in obj:
                if isinstance(item, (dict, list)):
                    check_refs(item)
    
    check_refs(converted_spec)
    
    if ref_paths_correct:
        print("✅ All reference paths use #/definitions/ format")
    
    # Check for anyOf keyword usage
    anyof_used = False
    
    def check_anyof(obj):
        nonlocal anyof_used
        if isinstance(obj, dict):
            if 'anyOf' in obj or 'oneOf' in obj:
                anyof_used = True
                print(f"❌ anyOf/oneOf keyword found in the converted spec")
            for value in obj.values():
                if isinstance(value, (dict, list)):
                    check_anyof(value)
        elif isinstance(obj, list):
            for item in obj:
                if isinstance(item, (dict, list)):
                    check_anyof(item)
    
    check_anyof(converted_spec)
    
    if not anyof_used:
        print("✅ No anyOf/oneOf keywords found in converted spec")
    
    # Check parameter types
    all_params_have_types = True
    
    def check_parameter_types(obj):
        nonlocal all_params_have_types
        if isinstance(obj, dict) and obj.get('paths'):
            for path_item in obj['paths'].values():
                for method, operation in path_item.items():
                    if method == 'parameters':
                        continue
                    if 'parameters' in operation:
                        for param in operation['parameters']:
                            if param.get('in') != 'body' and not param.get('type') and not param.get('schema'):
                                all_params_have_types = False
                                print(f"❌ Parameter without type found: {param.get('name')}")
    
    check_parameter_types(converted_spec)
    
    if all_params_have_types:
        print("✅ All non-body parameters have types")
    
    if result_swagger['warnings']:
        print("Warnings:")
        for warning in result_swagger['warnings']:
            print(f"- {warning}")
    else:
        print("No warnings.")

except Exception as e:
    print(f"Error during OpenAPI to Swagger conversion: {e}")

print("\n" + "=" * 40 + "\n")

# --- Test Swagger 2.0 to OpenAPI 3.x ---
print("--- Testing Swagger 2.0 to OpenAPI 3.x ---")
try:
    with open('test_swagger2.yaml', 'r') as f:
        swagger_content = f.read()

    print("Input Swagger 2.0:")
    print(swagger_content)
    print("-" * 20)

    result_openapi = convert_specification(swagger_content, ConversionDirection.SWAGGER_TO_OPENAPI)

    print("Output OpenAPI 3.x:")
    print(result_openapi['content'])
    print("-" * 20)

    # Load the converted spec for analysis
    converted_spec = yaml.safe_load(result_openapi['content'])
    
    # Check for global security
    if 'security' in converted_spec:
        print("✅ Global security preserved in converted OpenAPI spec")
    else:
        print("❌ Global security missing in converted OpenAPI spec")
    
    # Check for operation-level security
    if 'paths' in converted_spec:
        for path, path_item in converted_spec['paths'].items():
            for method, operation in path_item.items():
                if method == 'parameters':
                    continue
                if 'security' in operation:
                    print(f"✅ Operation security preserved in {method.upper()} {path}")
                else:
                    print(f"❌ Security missing in {method.upper()} {path}")
    
    if result_openapi['warnings']:
        print("Warnings:")
        for warning in result_openapi['warnings']:
            print(f"- {warning}")
    else:
        print("No warnings.")

except Exception as e:
    print(f"Error during Swagger to OpenAPI conversion: {e}")

print("\n--- Test Complete ---")
