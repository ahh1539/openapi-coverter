
import React, { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Upload, FileIcon, X, ArrowRight } from 'lucide-react';
import { isValidYaml, isValidJson, isOpenApi3, isSwagger2 } from '@/lib/converter';
import * as yaml from 'js-yaml';

interface FileUploaderProps {
  onFileUpload: (content: string, filename: string) => void;
}

const FileUploader = ({ onFileUpload }: FileUploaderProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFile = async (file: File) => {
    if (!file) return;
    
    try {
      setLoading(true);
      
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      
      if (!['yaml', 'yml', 'json'].includes(fileExtension || '')) {
        toast.error('Please upload a YAML or JSON file');
        setFile(null);
        setLoading(false);
        return;
      }
      
      const content = await file.text();
      
      // Process based on file type
      if (fileExtension === 'json') {
        if (!isValidJson(content)) {
          toast.error('The file contains invalid JSON');
          setFile(null);
          setLoading(false);
          return;
        }
        
        const parsedJson = JSON.parse(content);
        
        if (!isOpenApi3(parsedJson) && !isSwagger2(parsedJson)) {
          toast.error('The file is not a recognized API specification (OpenAPI 3.x or Swagger 2.0)');
          setFile(null);
          setLoading(false);
          return;
        }
        
        // Convert JSON to YAML for processing
        const yamlContent = yaml.dump(parsedJson);
        setFile(file);
        onFileUpload(yamlContent, file.name);
      } else {
        // YAML processing
        if (!isValidYaml(content)) {
          toast.error('The file contains invalid YAML');
          setFile(null);
          setLoading(false);
          return;
        }
        
        const parsedYaml = yaml.load(content) as any;
        
        if (!isOpenApi3(parsedYaml) && !isSwagger2(parsedYaml)) {
          toast.error('The file is not a recognized API specification (OpenAPI 3.x or Swagger 2.0)');
          setFile(null);
          setLoading(false);
          return;
        }
        
        setFile(file);
        onFileUpload(content, file.name);
      }
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error('Error processing file. Please try again.');
      setFile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFile(e.target.files[0]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`glass-card p-8 relative flex flex-col items-center justify-center h-64 transition-all cursor-pointer ${
          isDragging ? 'border-primary border-2 bg-primary/5' : 'border-white/30'
        } ${file ? 'bg-glass-card' : ''}`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".yaml,.yml,.json"
          className="hidden"
          disabled={loading}
        />

        {loading ? (
          <div className="animate-pulse-soft flex flex-col items-center">
            <div className="animate-spin h-10 w-10 mb-4 border-4 border-primary border-t-transparent rounded-full"></div>
            <p className="text-muted-foreground">Processing...</p>
          </div>
        ) : file ? (
          <div className="animate-fade-in flex flex-col items-center w-full">
            <div className="flex items-center justify-between w-full px-4 py-2 bg-white/10 rounded-lg mb-4">
              <div className="flex items-center">
                <FileIcon className="h-5 w-5 text-primary mr-2" />
                <p className="text-sm font-medium truncate max-w-xs">{file.name}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile();
                }}
                className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded-full hover:bg-destructive/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center text-primary">
              <p className="mr-2 text-sm font-medium">Ready to convert</p>
              <ArrowRight className="h-4 w-4" />
            </div>
          </div>
        ) : (
          <div className="animate-fade-in flex flex-col items-center">
            <div className="mb-4 p-3 rounded-full bg-primary/10">
              <Upload className="h-6 w-6 text-primary" />
            </div>
            <p className="text-center mb-2 font-medium">Drag and drop your API specification file here</p>
            <p className="text-center text-sm text-muted-foreground">or click to browse</p>
            <p className="text-center text-xs text-muted-foreground mt-2">Supports OpenAPI 3.x and Swagger 2.0 in YAML and JSON formats</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUploader;
