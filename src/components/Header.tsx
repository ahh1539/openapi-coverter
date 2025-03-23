
import React from 'react';
import { FileIcon, ArrowRightLeft } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

const Header = () => {
  return (
    <header className="w-full py-6 px-6 mb-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="glass inline-flex items-center px-4 py-2 rounded-full">
            <div className="mr-2 bg-primary/10 p-1 rounded-full">
              <FileIcon className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-lg font-medium">API Specification Converter</h1>
          </div>
          
          <ThemeToggle />
        </div>
        
        <div className="mt-12 text-center animate-fade-in">
          <h2 className="text-3xl font-bold mb-4 leading-tight">
            <span className="bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent animate-shine">
              Convert Between OpenAPI 3.x and Swagger 2.0
            </span>
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            A bidirectional conversion tool for API specifications. No data is stored - everything is processed in your browser.
            <span className="flex items-center justify-center gap-2 mt-2">
              <span className="font-medium">OpenAPI 3.x</span> 
              <ArrowRightLeft className="h-4 w-4" /> 
              <span className="font-medium">Swagger 2.0</span>
            </span>
          </p>
        </div>
      </div>
    </header>
  );
};

export default Header;
