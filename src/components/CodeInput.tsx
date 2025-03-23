
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FileText, FileJson, ArrowRight } from 'lucide-react';
import { isValidYaml, isOpenApi3 } from '@/lib/converter';
import * as yaml from 'js-yaml';

interface CodeInputProps {
  onContentSubmit: (content: string, type: string) => void;
}

const CodeInput = ({ onContentSubmit }: CodeInputProps) => {
  const [inputContent, setInputContent] = useState('');
  const [activeTab, setActiveTab] = useState('yaml');
  const [isLoading, setIsLoading] = useState(false);

  const handleProcessContent = async () => {
    if (!inputContent.trim()) {
      toast.error('Please enter your OpenAPI specification');
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
          onContentSubmit(yamlContent, `openapi.${contentType}`);
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
        
        if (!isOpenApi3(parsedYaml)) {
          toast.error('The content is not an OpenAPI 3.x specification');
          setIsLoading(false);
          return;
        }
        
        onContentSubmit(inputContent, `openapi.${contentType}`);
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
        <h3 className="text-base font-medium mb-4">Paste your OpenAPI 3.x specification</h3>
        
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
        
        <div className="mt-4">
          <button
            onClick={handleProcessContent}
            disabled={isLoading || !inputContent.trim()}
            className={`glass-button w-full px-6 py-3 font-medium flex items-center justify-center ${
              isLoading || !inputContent.trim() ? 'opacity-70 cursor-not-allowed' : ''
            }`}
          >
            {isLoading ? (
              <>
                <div className="animate-spin h-4 w-4 mr-2 border-2 border-current border-t-transparent rounded-full"></div>
                Processing...
              </>
            ) : (
              <>
                {activeTab === 'yaml' ? 'Convert YAML' : 'Convert JSON'}
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
