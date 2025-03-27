
import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { FileText, FileJson, AlertCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import * as yaml from 'js-yaml';
import { isValidYaml, isValidJson, isOpenApi3, isSwagger2, ConversionDirection } from '@/lib/converter';

interface CodeInputProps {
  onContentSubmit: (content: string, filename: string) => void;
  currentContent?: string | null;
  conversionDirection: ConversionDirection;
  onContentChange?: (hasContent: boolean) => void;
}

const CodeInput = ({ 
  onContentSubmit, 
  currentContent = null, 
  conversionDirection,
  onContentChange
}: CodeInputProps) => {
  const [inputContent, setInputContent] = useState('');
  const [activeTab, setActiveTab] = useState('yaml');
  const [isLoading, setIsLoading] = useState(false);
  const [validationStatus, setValidationStatus] = useState<{
    formatValid: boolean;
    specTypeValid: boolean;
    specType: string;
    message: string;
  } | null>(null);

  // Reset input when component gets a new key
  useEffect(() => {
    setInputContent('');
    setValidationStatus(null);
    if (onContentChange) onContentChange(false);
  }, []);

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
  
  // Notify parent about content changes when validation status changes
  useEffect(() => {
    if (!inputContent.trim()) {
      if (onContentChange) onContentChange(false);
      return;
    }
    
    console.log("CodeInput validation status:", validationStatus);
    // Check if content is both format valid and spec type valid
    if (validationStatus && validationStatus.formatValid && validationStatus.specTypeValid) {
      if (onContentChange) onContentChange(true);
      
      // Automatically submit valid content to parent
      console.log("CodeInput auto-submitting validated content");
      const contentType = activeTab === 'yaml' ? 'yaml' : 'json';
      onContentSubmit(inputContent, `api-spec.${contentType}`);
    } else {
      if (onContentChange) onContentChange(false);
    }
  }, [validationStatus, inputContent, activeTab]);
  
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

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputContent(value);
  };

  return (
    <div className="w-full">
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
            onChange={handleInputChange}
          />
        </TabsContent>
        
        <TabsContent value="json">
          <Textarea 
            className="glass-input min-h-[200px] font-mono text-sm"
            placeholder={conversionDirection === ConversionDirection.SWAGGER_TO_OPENAPI 
              ? "Paste your Swagger 2.0 JSON here..."
              : "Paste your OpenAPI 3.x JSON here..."}
            value={inputContent}
            onChange={handleInputChange}
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
    </div>
  );
};

export default CodeInput;
