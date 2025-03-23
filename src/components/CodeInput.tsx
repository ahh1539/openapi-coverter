
import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FileText, FileJson, ArrowRight, AlertCircle } from 'lucide-react';
import { isValidYaml, isValidJson, isOpenApi3, isSwagger2 } from '@/lib/converter';
import * as yaml from 'js-yaml';

interface CodeInputProps {
  onContentSubmit: (content: string, type: string) => void;
}

const CodeInput = ({ onContentSubmit }: CodeInputProps) => {
  const [inputContent, setInputContent] = useState('');
  const [activeTab, setActiveTab] = useState('yaml');
  const [isLoading, setIsLoading] = useState(false);
  const [validationStatus, setValidationStatus] = useState<{
    formatValid: boolean;
    specTypeValid: boolean;
    specType: string;
    message: string;
  } | null>(null);

  // Validate input whenever content or active tab changes
  useEffect(() => {
    if (!inputContent.trim()) {
      setValidationStatus(null);
      return;
    }
    
    validateInput(inputContent, activeTab);
  }, [inputContent, activeTab]);
  
  const validateInput = (content: string, format: string) => {
    // Check format validation (YAML or JSON)
    let formatValid = false;
    let parsedContent: any = null;
    let specTypeValid = false;
    let specType = 'unknown';
    let message = '';
    
    if (format === 'yaml') {
      if (!isValidYaml(content)) {
        formatValid = false;
        message = 'Invalid YAML format';
      } else {
        formatValid = true;
        parsedContent = yaml.load(content);
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
    
    // If format is valid, check specification type
    if (formatValid && parsedContent) {
      if (isOpenApi3(parsedContent)) {
        specType = 'OpenAPI 3.x';
        specTypeValid = true;
      } else if (isSwagger2(parsedContent)) {
        specType = 'Swagger 2.0';
        specTypeValid = true;
      } else {
        specTypeValid = false;
        message = 'Not a valid API specification (OpenAPI 3.x or Swagger 2.0)';
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
        
        const parsedYaml = yaml.load(inputContent) as any;
        
        if (!isOpenApi3(parsedYaml) && !isSwagger2(parsedYaml)) {
          toast.error('The content is not a recognized API specification (OpenAPI 3.x or Swagger 2.0)');
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
        <h3 className="text-base font-medium mb-4">Paste your API specification (OpenAPI 3.x or Swagger 2.0)</h3>
        
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
              placeholder="Paste your YAML here..."
              value={inputContent}
              onChange={(e) => setInputContent(e.target.value)}
            />
          </TabsContent>
          
          <TabsContent value="json">
            <Textarea 
              className="glass-input min-h-[200px] font-mono text-sm"
              placeholder="Paste your JSON here..."
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
