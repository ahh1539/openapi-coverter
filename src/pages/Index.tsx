
import React, { useState } from 'react';
import { toast } from 'sonner';
import FileUploader from '@/components/FileUploader';
import ConversionResult from '@/components/ConversionResult';
import ConversionWarnings from '@/components/ConversionWarnings';
import CodeInput from '@/components/CodeInput';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { convertOpenApiToSwagger } from '@/lib/converter';
import { ArrowRight, Upload } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Index = () => {
  const [isConverting, setIsConverting] = useState(false);
  const [yamlContent, setYamlContent] = useState<string | null>(null);
  const [swaggerContent, setSwaggerContent] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>('');
  const [inputMethod, setInputMethod] = useState<'upload' | 'paste'>('upload');
  const [conversionWarnings, setConversionWarnings] = useState<string[]>([]);

  const handleFileUpload = (content: string, name: string) => {
    setYamlContent(content);
    setFilename(name);
    setSwaggerContent(null);
    setConversionWarnings([]);
  };
  
  const handleContentSubmit = (content: string, name: string) => {
    setYamlContent(content);
    setFilename(name);
    setSwaggerContent(null);
    setConversionWarnings([]);
  };

  const handleConvert = async () => {
    if (!yamlContent) {
      toast.error('Please upload or paste an OpenAPI file first');
      return;
    }
    
    setIsConverting(true);
    
    try {
      // Small delay to show the animation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const conversionResult = convertOpenApiToSwagger(yamlContent);
      setSwaggerContent(conversionResult.content);
      setConversionWarnings(conversionResult.warnings);
      
      toast.success('Conversion completed successfully');
    } catch (error) {
      console.error('Conversion error:', error);
      toast.error(error instanceof Error ? error.message : 'An error occurred during conversion');
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 w-full max-w-4xl mx-auto px-6 pb-12">
        <div className="w-full">
          <Tabs defaultValue="upload" value={inputMethod} onValueChange={(v) => setInputMethod(v as 'upload' | 'paste')}>
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
              <FileUploader onFileUpload={handleFileUpload} />
            </TabsContent>
            
            <TabsContent value="paste">
              <CodeInput onContentSubmit={handleContentSubmit} />
            </TabsContent>
          </Tabs>
          
          {yamlContent && (
            <div className="mt-8 flex justify-center animate-fade-in">
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
                    Convert to Swagger 2.0
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          )}
          
          {conversionWarnings.length > 0 && (
            <ConversionWarnings warnings={conversionWarnings} />
          )}
          
          {swaggerContent && (
            <div className="mt-8">
              <ConversionResult content={swaggerContent} filename={filename} />
            </div>
          )}
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default Index;
