import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Download, Copy, Check, ChevronUp, ChevronDown, FileIcon, FileJson, FileText, Eye } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import ApiVisualizer from './ApiVisualizer';
import { parseApiSpec } from '@/lib/apiVisualizer';
import * as yaml from 'js-yaml';

interface ConversionResultProps {
  content: string;
  filename: string;
}

const ConversionResult = ({ content, filename }: ConversionResultProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeFormat, setActiveFormat] = useState('yaml');
  const [isVisualizerOpen, setIsVisualizerOpen] = useState(false);
  const [processedContent, setProcessedContent] = useState<string>('');

  console.log('ConversionResult rendered with content length:', content ? content.length : 0);
  console.log('ConversionResult filename:', filename);

  useEffect(() => {
    if (content) {
      console.log('Setting processed content, length:', content.length);
      setProcessedContent(content);
    } else {
      console.log('No content to process in ConversionResult');
      setProcessedContent('');
    }
  }, [content]);

  if (!content || content.trim() === '') {
    console.warn('ConversionResult rendered with empty content, returning null');
    return null;
  }

  const handleDownload = () => {
    let downloadContent = processedContent;
    let fileExtension = 'yaml';
    
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
    const baseName = filename.replace(/\.(yaml|yml|json)$/, '');
    a.download = `${baseName}.${fileExtension}`;
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success(`File downloaded as ${activeFormat.toUpperCase()}`);
  };

  const handleCopy = async () => {
    try {
      let copyContent = content;
      
      if (activeFormat === 'json') {
        const jsonObj = yaml.load(content);
        copyContent = JSON.stringify(jsonObj, null, 2);
      }
      
      await navigator.clipboard.writeText(copyContent);
      setIsCopied(true);
      toast.success('Content copied to clipboard');
      
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

  const getJsonContent = () => {
    try {
      if (!processedContent) {
        console.warn('No content to convert to JSON');
        return '// No content available';
      }
      const jsonObj = yaml.load(processedContent);
      return JSON.stringify(jsonObj, null, 2);
    } catch (error) {
      console.error('Error converting YAML to JSON:', error);
      return '/* Error converting YAML to JSON */';
    }
  };

  const handleVisualize = () => {
    setIsVisualizerOpen(true);
  };

  return (
    <div className="w-full max-w-xl mx-auto animate-scale-in">
      <div className="glass-card p-6">
        <div className="flex flex-col sm:flex-row items-center justify-between mb-4 gap-3">
          <div className="flex items-center">
            <FileIcon className="h-5 w-5 text-primary mr-2" />
            <h3 className="font-medium">{filename.replace(/\.(yaml|yml|json)$/, activeFormat === 'yaml' ? '.yaml' : '.json')}</h3>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <button
              onClick={handleVisualize}
              className="glass-button flex items-center justify-center flex-1 sm:flex-none"
              aria-label="Visualize API"
            >
              <Eye className="h-4 w-4 mr-1" />
              <span>Visualize</span>
            </button>
            <button
              onClick={handleCopy}
              className="glass-button flex items-center justify-center flex-1 sm:flex-none"
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
              className="glass-button flex items-center justify-center bg-primary/10 hover:bg-primary/20 flex-1 sm:flex-none"
              aria-label="Download file"
            >
              <Download className="h-4 w-4 mr-1" />
              <span>Download {activeFormat.toUpperCase()}</span>
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
              <ScrollArea className={`bg-black/5 rounded-lg p-4 font-mono text-xs ${
                isExpanded ? 'h-[500px]' : 'h-[240px]'
              } transition-all duration-300`}>
                <pre className="whitespace-pre-wrap break-words">
                  {processedContent}
                </pre>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="json">
              <ScrollArea className={`bg-black/5 rounded-lg p-4 font-mono text-xs ${
                isExpanded ? 'h-[500px]' : 'h-[240px]'
              } transition-all duration-300`}>
                <pre className="whitespace-pre-wrap break-words">
                  {getJsonContent()}
                </pre>
              </ScrollArea>
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
      
      <ApiVisualizer 
        data={parseApiSpec(processedContent)}
        isOpen={isVisualizerOpen}
        onClose={() => setIsVisualizerOpen(false)}
      />
    </div>
  );
};

export default ConversionResult;
