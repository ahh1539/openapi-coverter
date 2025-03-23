
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Download, Copy, Check, ChevronUp, ChevronDown, FileIcon } from 'lucide-react';

interface ConversionResultProps {
  content: string;
  filename: string;
}

const ConversionResult = ({ content, filename }: ConversionResultProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    // Create filename based on original filename
    const newFilename = filename.replace(/\.(yaml|yml)$/, '-swagger2.yaml');
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
      await navigator.clipboard.writeText(content);
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

  return (
    <div className="w-full max-w-xl mx-auto animate-scale-in">
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <FileIcon className="h-5 w-5 text-primary mr-2" />
            <h3 className="font-medium">{filename.replace(/\.(yaml|yml)$/, '-swagger2.yaml')}</h3>
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
        
        <div className="relative">
          <button
            onClick={toggleExpand}
            className="absolute right-2 top-2 p-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          
          <div 
            className={`bg-black/5 rounded-lg p-4 font-mono text-xs overflow-hidden ${
              isExpanded ? 'max-h-[500px]' : 'max-h-40'
            } transition-all duration-300`}
          >
            <pre className="whitespace-pre-wrap break-words overflow-auto max-h-full">
              {content}
            </pre>
          </div>
          
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
      </div>
    </div>
  );
};

export default ConversionResult;
