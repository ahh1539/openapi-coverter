
import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FileText, FileJson, ArrowRight, AlertCircle } from 'lucide-react';
import { isValidYaml, isValidJson, isOpenApi3, isSwagger2, ConversionDirection } from '@/lib/converter';
import * as yaml from 'js-yaml';

interface CodeInputProps {
  onContentSubmit: (content: string, type: string) => void;
  currentContent?: string | null;
  conversionDirection: ConversionDirection;
}

const CodeInput = ({ onContentSubmit, currentContent = null, conversionDirection }: CodeInputProps) => {
  const [inputContent, setInputContent] = useState('');
  const [activeTab, setActiveTab] = useState('yaml');
  const [isLoading, setIsLoading] = useState(false);
  const [validationStatus, setValidationStatus] = useState<{
    formatValid: boolean;
    specTypeValid: boolean;
    specType: string;
    message: string;
  } | null>(null);

  // Set input content when currentContent prop changes
  useEffect(() => {
    if (currentContent) {
      setInputContent(currentContent);
      
      // Detect if it's JSON or YAML
      try {
        JSON.parse(currentContent);
        setActiveTab('json');
      } catch (e) {
        // If not valid JSON, assume it's YAML
        setActiveTab('yaml');
      }
    }
  }, [currentContent]);

  // Validate input whenever content, active tab, or conversion direction changes
  useEffect(() => {
    if (!inputContent.trim()) {
      setValidationStatus(null);
      return;
    }
    
    validateInput(inputContent, activeTab, conversionDirection);
  }, [inputContent, activeTab, conversionDirection]);
  
  const validateInput = (content: string, format: string, direction: ConversionDirection) => {
    // Check format validation (YAML or JSON)
    let formatValid = false;
    let parsedContent: any = null;
    let specTypeValid = false;
    let specType = 'unknown';
    let message = '';
    
    if (format === 'yaml') {
      // Check if it's valid YAML format
      if (!isValidYaml(content)) {
        formatValid = false;
        message = 'Invalid YAML format';
      } else {
        // Additionally check if it's not actually JSON masquerading as YAML
        try {
          // If this succeeds, it's valid JSON, we should check if the content would be different when parsed as YAML
          const jsonParsed = JSON.parse(content);
          const yamlParsed = yaml.load(content);
          
          // If JSON parsing works and produces the same output as YAML parsing,
          // it's likely that this is JSON content in the YAML tab
          if (JSON.stringify(jsonParsed) === JSON.stringify(yamlParsed) && content.includes('{') && content.includes('"')) {
            formatValid = false;
            message = 'JSON format detected. Please use the JSON tab for this content';
          } else {
            formatValid = true;
            parsedContent = yamlParsed;
          }
        } catch (error) {
          // If JSON.parse fails, it's valid YAML but not valid JSON, which is fine for YAML tab
          formatValid = true;
          parsedContent = yaml.load(content);
        }
      }
    } else if (format === 'json') {
      try {
        parsedContent = JSON.parse(content);
        formatValid = true;
      } catch (error) {
        formatValid = false;
        message = 'Invalid JSON format';
      }
    }
    
    // If format is valid, check specification type and match with conversion direction
    if (formatValid && parsedContent) {
      const isOpenApi = isOpenApi3(parsedContent);
      const isSwagger = isSwagger2(parsedContent);
      
      if (isOpenApi) {
        specType = 'OpenAPI 3.x';
      } else if (isSwagger) {
        specType = 'Swagger 2.0';
      } else {
        specTypeValid = false;
        message = 'Not a valid API specification (OpenAPI 3.x or Swagger 2.0)';
      }
      
      // Verify the spec type matches the conversion direction
      if (isOpenApi && direction === ConversionDirection.SWAGGER_TO_OPENAPI) {
        specTypeValid = false;
        message = `Expected Swagger 2.0 specification for "${direction}" conversion`;
      } else if (isSwagger && direction === ConversionDirection.OPENAPI_TO_SWAGGER) {
        specTypeValid = false;
        message = `Expected OpenAPI 3.x specification for "${direction}" conversion`;
      } else if (isOpenApi || isSwagger) {
        specTypeValid = true;
      }
    }
    
    setValidationStatus({
      formatValid,
      specTypeValid,
      specType,
      message
    });
  };

  const handleProcessContent = async () => {
    if (!inputContent.trim()) {
      toast.error('Please enter your API specification');
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Parse based on the selected format
      let parsedContent;
      let contentType = activeTab;
      
      if (activeTab === 'json') {
        try {
          parsedContent = JSON.parse(inputContent);
          
          // Validate specification type for the current conversion direction
          if (conversionDirection === ConversionDirection.SWAGGER_TO_OPENAPI && !isSwagger2(parsedContent)) {
            toast.error('Expected Swagger 2.0 specification for Swagger to OpenAPI conversion');
            setIsLoading(false);
            return;
          } else if (conversionDirection === ConversionDirection.OPENAPI_TO_SWAGGER && !isOpenApi3(parsedContent)) {
            toast.error('Expected OpenAPI 3.x specification for OpenAPI to Swagger conversion');
            setIsLoading(false);
            return;
          }
          
          // Convert JSON to YAML for processing
          const yamlContent = yaml.dump(parsedContent);
          contentType = 'yaml';
          onContentSubmit(yamlContent, `api-spec.${contentType}`);
        } catch (error) {
          toast.error('Invalid JSON format');
          setIsLoading(false);
          return;
        }
      } else {
        // YAML processing
        if (!isValidYaml(inputContent)) {
          toast.error('Invalid YAML format');
          setIsLoading(false);
          return;
        }
        
        try {
          // Double-check if it's not JSON in YAML tab
          JSON.parse(inputContent);
          toast.error('JSON detected in YAML tab. Please use the JSON tab for this content');
          setIsLoading(false);
          return;
        } catch (e) {
          // This is correct - it should not be valid JSON when in YAML tab
          // (unless it's also valid YAML, which is handled by the validation)
        }
        
        const parsedYaml = yaml.load(inputContent) as any;
        
        // Validate specification type for the current conversion direction
        if (conversionDirection === ConversionDirection.SWAGGER_TO_OPENAPI && !isSwagger2(parsedYaml)) {
          toast.error('Expected Swagger 2.0 specification for Swagger to OpenAPI conversion');
          setIsLoading(false);
          return;
        } else if (conversionDirection === ConversionDirection.OPENAPI_TO_SWAGGER && !isOpenApi3(parsedYaml)) {
          toast.error('Expected OpenAPI 3.x specification for OpenAPI to Swagger conversion');
          setIsLoading(false);
          return;
        }
        
        onContentSubmit(inputContent, `api-spec.${contentType}`);
      }
    } catch (error) {
      console.error('Error processing content:', error);
      toast.error('Error processing your specification');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="glass-card p-6">
        <h3 className="text-base font-medium mb-4">
          {conversionDirection === ConversionDirection.SWAGGER_TO_OPENAPI 
            ? 'Paste your Swagger 2.0 specification'
            : 'Paste your OpenAPI 3.x specification'}
        </h3>
        
        <Tabs defaultValue="yaml" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="glass mb-4">
            <TabsTrigger value="yaml" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              YAML
            </TabsTrigger>
            <TabsTrigger value="json" className="flex items-center gap-2">
              <FileJson className="h-4 w-4" />
              JSON
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="yaml">
            <Textarea 
              className="glass-input min-h-[200px] font-mono text-sm"
              placeholder={conversionDirection === ConversionDirection.SWAGGER_TO_OPENAPI 
                ? "Paste your Swagger 2.0 YAML here..."
                : "Paste your OpenAPI 3.x YAML here..."}
              value={inputContent}
              onChange={(e) => setInputContent(e.target.value)}
            />
          </TabsContent>
          
          <TabsContent value="json">
            <Textarea 
              className="glass-input min-h-[200px] font-mono text-sm"
              placeholder={conversionDirection === ConversionDirection.SWAGGER_TO_OPENAPI 
                ? "Paste your Swagger 2.0 JSON here..."
                : "Paste your OpenAPI 3.x JSON here..."}
              value={inputContent}
              onChange={(e) => setInputContent(e.target.value)}
            />
          </TabsContent>
        </Tabs>
        
        {validationStatus && inputContent.trim() && (
          <div className={`mt-3 p-2 rounded-md text-sm flex items-start gap-2 ${
            validationStatus.formatValid && validationStatus.specTypeValid
              ? 'bg-green-500/10 text-green-600'
              : 'bg-amber-500/10 text-amber-600'
          }`}>
            {validationStatus.formatValid && validationStatus.specTypeValid ? (
              <>
                <FileText className="h-4 w-4 mt-0.5" />
                <span>Valid {validationStatus.specType} specification in {activeTab.toUpperCase()} format</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>{validationStatus.message}</span>
              </>
            )}
          </div>
        )}
        
        <div className="mt-4">
          <button
            onClick={handleProcessContent}
            disabled={isLoading || !inputContent.trim() || (validationStatus && (!validationStatus.formatValid || !validationStatus.specTypeValid))}
            className={`glass-button w-full px-6 py-3 font-medium flex items-center justify-center ${
              isLoading || !inputContent.trim() || (validationStatus && (!validationStatus.formatValid || !validationStatus.specTypeValid)) ? 'opacity-70 cursor-not-allowed' : ''
            }`}
          >
            {isLoading ? (
              <>
                <div className="animate-spin h-4 w-4 mr-2 border-2 border-current border-t-transparent rounded-full"></div>
                Processing...
              </>
            ) : (
              <>
                Process {activeTab === 'yaml' ? 'YAML' : 'JSON'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CodeInput;
