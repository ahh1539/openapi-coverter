
import React, { useState } from 'react';
import { toast } from 'sonner';
import FileUploader from '@/components/FileUploader';
import ConversionResult from '@/components/ConversionResult';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { convertOpenApiToSwagger } from '@/lib/converter';
import { ArrowRight } from 'lucide-react';

const Index = () => {
  const [isConverting, setIsConverting] = useState(false);
  const [yamlContent, setYamlContent] = useState<string | null>(null);
  const [swaggerContent, setSwaggerContent] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>('');

  const handleFileUpload = (content: string, name: string) => {
    setYamlContent(content);
    setFilename(name);
    setSwaggerContent(null);
  };

  const handleConvert = async () => {
    if (!yamlContent) {
      toast.error('Please upload an OpenAPI file first');
      return;
    }
    
    setIsConverting(true);
    
    try {
      // Small delay to show the animation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const converted = convertOpenApiToSwagger(yamlContent);
      setSwaggerContent(converted);
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
          <FileUploader onFileUpload={handleFileUpload} />
          
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
