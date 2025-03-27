import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import FileUploader from '@/components/FileUploader';
import ConversionResult from '@/components/ConversionResult';
import ConversionWarnings from '@/components/ConversionWarnings';
import CodeInput from '@/components/CodeInput';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { 
  convertSpecification, 
  ConversionDirection, 
  detectSpecType 
} from '@/lib/converter';
import { ArrowRight, Upload, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const Index = () => {
  const [isConverting, setIsConverting] = useState(false);
  const [yamlContent, setYamlContent] = useState<string | null>(null);
  const [swaggerContent, setSwaggerContent] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>('');
  const [inputMethod, setInputMethod] = useState<'upload' | 'paste'>('upload');
  const [conversionWarnings, setConversionWarnings] = useState<string[]>([]);
  const [direction, setDirection] = useState<ConversionDirection>(ConversionDirection.OPENAPI_TO_SWAGGER);
  const [hasInput, setHasInput] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const isMobile = useIsMobile();

  const handleFileUpload = (content: string, name: string) => {
    setYamlContent(content);
    setFilename(name);
    setSwaggerContent(null);
    setConversionWarnings([]);
    
    if (content) {
      setHasInput(true);
      const specType = detectSpecType(content);
      
      if ((direction === ConversionDirection.OPENAPI_TO_SWAGGER && specType !== 'openapi3') ||
          (direction === ConversionDirection.SWAGGER_TO_OPENAPI && specType !== 'swagger2')) {
        const expectedType = direction === ConversionDirection.OPENAPI_TO_SWAGGER ? 'OpenAPI 3.x' : 'Swagger 2.0';
        const actualType = specType === 'openapi3' ? 'OpenAPI 3.x' : specType === 'swagger2' ? 'Swagger 2.0' : 'Unknown';
        toast.error(`Expected ${expectedType} specification but detected ${actualType}`);
        setYamlContent(null);
        setFilename('');
        setHasInput(false);
      }
    } else {
      setHasInput(false);
    }
  };
  
  const handleContentSubmit = (content: string, name: string) => {
    setYamlContent(content);
    setFilename(name);
    setSwaggerContent(null);
    setConversionWarnings([]);
    setHasInput(!!content);
  };
  
  const handleContentChange = (hasContent: boolean) => {
    setHasInput(hasContent);
  };

  const clearInput = () => {
    setYamlContent(null);
    setFilename('');
    setSwaggerContent(null);
    setConversionWarnings([]);
    setHasInput(false);
    setResetKey(prev => prev + 1);
  };

  const handleConvert = async () => {
    if (!yamlContent) {
      toast.error('Please upload or paste a specification file first');
      return;
    }
    
    setIsConverting(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const specType = detectSpecType(yamlContent);
      
      if ((direction === ConversionDirection.OPENAPI_TO_SWAGGER && specType !== 'openapi3') ||
          (direction === ConversionDirection.SWAGGER_TO_OPENAPI && specType !== 'swagger2')) {
        const expectedType = direction === ConversionDirection.OPENAPI_TO_SWAGGER ? 'OpenAPI 3.x' : 'Swagger 2.0';
        throw new Error(`Expected ${expectedType} specification. Conversion cannot proceed.`);
      }
      
      const conversionResult = convertSpecification(yamlContent, direction);
      setSwaggerContent(conversionResult.content);
      setConversionWarnings(conversionResult.warnings);
      
      const successMessage = direction === ConversionDirection.OPENAPI_TO_SWAGGER 
        ? 'Successfully converted to Swagger 2.0' 
        : 'Successfully converted to OpenAPI 3.0';
      
      toast.success(successMessage);
    } catch (error) {
      console.error('Conversion error:', error);
      toast.error(error instanceof Error ? error.message : 'An error occurred during conversion');
    } finally {
      setIsConverting(false);
    }
  };

  const getResultFilename = () => {
    const baseName = filename.replace(/\.(yaml|yml|json)$/, '');
    
    if (direction === ConversionDirection.OPENAPI_TO_SWAGGER) {
      return `${baseName}-swagger2.yaml`;
    } else {
      return `${baseName}-openapi3.yaml`;
    }
  };

  const toggleDirection = (checked: boolean) => {
    const newDirection = checked ? ConversionDirection.SWAGGER_TO_OPENAPI : ConversionDirection.OPENAPI_TO_SWAGGER;
    setDirection(newDirection);
    
    if (yamlContent) {
      const specType = detectSpecType(yamlContent);
      if ((newDirection === ConversionDirection.OPENAPI_TO_SWAGGER && specType !== 'openapi3') ||
          (newDirection === ConversionDirection.SWAGGER_TO_OPENAPI && specType !== 'swagger2')) {
        clearInput();
      }
    }
    
    setSwaggerContent(null);
    setConversionWarnings([]);
  };

  const handleTabChange = (value: string) => {
    setInputMethod(value as 'upload' | 'paste');
  };

  const renderConvertButton = () => {
    return (
      <div className={`flex justify-center mt-8 ${hasInput ? 'animate-fade-in' : 'hidden'}`}>
        <button
          onClick={handleConvert}
          disabled={isConverting}
          className={`glass-button px-6 py-3 font-medium flex items-center justify-center ${
            isConverting ? 'opacity-70 cursor-not-allowed' : ''
          }`}
        >
          {isConverting ? (
            <>
              <div className="animate-spin h-4 w-4 mr-2 border-2 border-current border-t-transparent rounded-full"></div>
              Converting...
            </>
          ) : (
            <>
              {direction === ConversionDirection.OPENAPI_TO_SWAGGER ? 'Convert to Swagger 2.0' : 'Convert to OpenAPI 3.0'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 w-full mx-auto px-6 pb-12">
        <div className="w-full max-w-[1280px] mx-auto mb-8">
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 glass-card p-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="conversion-direction">
                {direction === ConversionDirection.OPENAPI_TO_SWAGGER ? 'OpenAPI 3.x → Swagger 2.0' : 'Swagger 2.0 → OpenAPI 3.x'}
              </Label>
              <Switch 
                id="conversion-direction" 
                checked={direction === ConversionDirection.SWAGGER_TO_OPENAPI}
                onCheckedChange={toggleDirection}
              />
            </div>
            
            {hasInput && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={clearInput}
                className="glass-button"
              >
                <X className="h-4 w-4 mr-1" /> Clear Input
              </Button>
            )}
          </div>
        </div>
        
        {isMobile ? (
          <div className="w-full max-w-4xl mx-auto">
            <Tabs defaultValue="upload" value={inputMethod} onValueChange={handleTabChange}>
              <div className="flex justify-center mb-8">
                <TabsList className="glass">
                  <TabsTrigger value="upload" className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Upload File
                  </TabsTrigger>
                  <TabsTrigger value="paste" className="flex items-center gap-2">
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4">
                      <path d="M5 2V1H10V2H5Z" fill="currentColor" />
                      <path d="M3 3H12V14H3V3Z" fill="currentColor" />
                    </svg>
                    Paste Code
                  </TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent value="upload">
                <FileUploader 
                  key={`file-uploader-${resetKey}`} 
                  onFileUpload={handleFileUpload} 
                  conversionDirection={direction}
                  onContentChange={handleContentChange}
                  currentContent={yamlContent}
                  currentFilename={filename}
                />
              </TabsContent>
              
              <TabsContent value="paste">
                <CodeInput 
                  key={`code-input-${resetKey}`}
                  onContentSubmit={handleContentSubmit} 
                  currentContent={yamlContent} 
                  conversionDirection={direction}
                  onContentChange={handleContentChange}
                />
              </TabsContent>
            </Tabs>
            
            {renderConvertButton()}
            
            {conversionWarnings.length > 0 && (
              <ConversionWarnings warnings={conversionWarnings} />
            )}
            
            {swaggerContent && (
              <div className="mt-8">
                <ConversionResult 
                  content={swaggerContent} 
                  filename={getResultFilename()} 
                />
              </div>
            )}
          </div>
        ) : (
          <div className="w-full max-w-[1280px] mx-auto">
            <ResizablePanelGroup direction="horizontal" className="min-h-[600px]">
              <ResizablePanel defaultSize={50} minSize={30}>
                <div className="h-full p-4">
                  <Tabs defaultValue="upload" value={inputMethod} onValueChange={handleTabChange}>
                    <div className="flex justify-center mb-8">
                      <TabsList className="glass">
                        <TabsTrigger value="upload" className="flex items-center gap-2">
                          <Upload className="h-4 w-4" />
                          Upload File
                        </TabsTrigger>
                        <TabsTrigger value="paste" className="flex items-center gap-2">
                          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4">
                            <path d="M5 2V1H10V2H5Z" fill="currentColor" />
                            <path d="M3 3H12V14H3V3Z" fill="currentColor" />
                          </svg>
                          Paste Code
                        </TabsTrigger>
                      </TabsList>
                    </div>
                    
                    <TabsContent value="upload">
                      <FileUploader 
                        key={`file-uploader-${resetKey}`}
                        onFileUpload={handleFileUpload} 
                        conversionDirection={direction}
                        onContentChange={handleContentChange}
                        currentContent={yamlContent}
                        currentFilename={filename}
                      />
                    </TabsContent>
                    
                    <TabsContent value="paste">
                      <CodeInput 
                        key={`code-input-${resetKey}`}
                        onContentSubmit={handleContentSubmit} 
                        currentContent={yamlContent} 
                        conversionDirection={direction}
                        onContentChange={handleContentChange}
                      />
                    </TabsContent>
                  </Tabs>
                  
                  {renderConvertButton()}
                </div>
              </ResizablePanel>
              
              <ResizableHandle withHandle />
              
              <ResizablePanel defaultSize={50} minSize={30}>
                <div className="h-full p-4 overflow-y-auto flex flex-col gap-6">
                  {conversionWarnings.length > 0 && (
                    <ConversionWarnings warnings={conversionWarnings} />
                  )}
                  
                  {swaggerContent ? (
                    <ConversionResult 
                      content={swaggerContent} 
                      filename={getResultFilename()} 
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center text-muted-foreground">
                        <p>Converted content will appear here</p>
                      </div>
                    </div>
                  )}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        )}
      </main>
      
      <Footer />
    </div>
  );
};

export default Index;
