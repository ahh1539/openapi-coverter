
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Download, Copy, Check, ChevronUp, ChevronDown, FileIcon, FileJson, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as yaml from 'js-yaml';

interface ConversionResultProps {
  content: string;
  filename: string;
}

const ConversionResult = ({ content, filename }: ConversionResultProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeFormat, setActiveFormat] = useState('yaml');

  const handleDownload = () => {
    let downloadContent = content;
    let fileExtension = 'yaml';
    
    // Convert to JSON if needed
    if (activeFormat === 'json') {
      try {
        const jsonObj = yaml.load(content);
        downloadContent = JSON.stringify(jsonObj, null, 2);
        fileExtension = 'json';
      } catch (error) {
        console.error('Error converting YAML to JSON:', error);
        toast.error('Failed to convert to JSON format');
        return;
      }
    }
    
    const blob = new Blob([downloadContent], { 
      type: activeFormat === 'yaml' ? 'text/yaml' : 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    // Create filename based on original filename
    const baseName = filename.replace(/\.(yaml|yml|json)$/, '');
    const newFilename = `${baseName}-swagger2.${fileExtension}`;
    a.download = newFilename;
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('File downloaded successfully');
  };

  const handleCopy = async () => {
    try {
      let copyContent = content;
      
      // Convert to JSON if needed
      if (activeFormat === 'json') {
        const jsonObj = yaml.load(content);
        copyContent = JSON.stringify(jsonObj, null, 2);
      }
      
      await navigator.clipboard.writeText(copyContent);
      setIsCopied(true);
      toast.success('Content copied to clipboard');
      
      // Reset copy state after 2 seconds
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error('Failed to copy to clipboard');
    }
  };

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  // Convert YAML to JSON for display in JSON tab
  const getJsonContent = () => {
    try {
      const jsonObj = yaml.load(content);
      return JSON.stringify(jsonObj, null, 2);
    } catch (error) {
      console.error('Error converting YAML to JSON:', error);
      return '/* Error converting YAML to JSON */';
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto animate-scale-in">
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <FileIcon className="h-5 w-5 text-primary mr-2" />
            <h3 className="font-medium">{filename.replace(/\.(yaml|yml|json)$/, '-swagger2.yaml')}</h3>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleCopy}
              className="glass-button flex items-center justify-center"
              aria-label="Copy content"
            >
              {isCopied ? (
                <Check className="h-4 w-4 mr-1" />
              ) : (
                <Copy className="h-4 w-4 mr-1" />
              )}
              <span>{isCopied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="glass-button flex items-center justify-center bg-primary/10 hover:bg-primary/20"
              aria-label="Download file"
            >
              <Download className="h-4 w-4 mr-1" />
              <span>Download</span>
            </button>
          </div>
        </div>
        
        <Tabs defaultValue="yaml" value={activeFormat} onValueChange={setActiveFormat}>
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
          
          <div className="relative">
            <button
              onClick={toggleExpand}
              className="absolute right-2 top-2 p-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors z-10"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            
            <TabsContent value="yaml">
              <div 
                className={`bg-black/5 rounded-lg p-4 font-mono text-xs overflow-hidden ${
                  isExpanded ? 'max-h-[500px]' : 'max-h-40'
                } transition-all duration-300`}
              >
                <pre className="whitespace-pre-wrap break-words overflow-auto max-h-full">
                  {content}
                </pre>
              </div>
            </TabsContent>
            
            <TabsContent value="json">
              <div 
                className={`bg-black/5 rounded-lg p-4 font-mono text-xs overflow-hidden ${
                  isExpanded ? 'max-h-[500px]' : 'max-h-40'
                } transition-all duration-300`}
              >
                <pre className="whitespace-pre-wrap break-words overflow-auto max-h-full">
                  {getJsonContent()}
                </pre>
              </div>
            </TabsContent>
            
            {!isExpanded && (
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white/20 to-transparent rounded-b-lg flex items-end justify-center p-2">
                <button
                  onClick={toggleExpand}
                  className="text-xs text-primary/80 hover:text-primary transition-colors font-medium"
                >
                  Show more
                </button>
              </div>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default ConversionResult;
