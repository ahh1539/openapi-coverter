
import React from 'react';
import { FileIcon } from 'lucide-react';

const Header = () => {
  return (
    <header className="w-full py-6 px-6 mb-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center">
          <div className="glass inline-flex items-center px-4 py-2 rounded-full">
            <div className="mr-2 bg-primary/10 p-1 rounded-full">
              <FileIcon className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-lg font-medium">OpenAPI Converter</h1>
          </div>
        </div>
        
        <div className="mt-12 text-center animate-fade-in">
          <h2 className="text-3xl font-bold mb-4 leading-tight">
            <span className="bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent animate-shine">
              Convert OpenAPI 3.x to Swagger 2.0
            </span>
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            A simple, elegant tool to convert your OpenAPI 3.x YAML specifications to Swagger 2.0 format with ease.
          </p>
        </div>
      </div>
    </header>
  );
};

export default Header;
