
import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConversionWarningsProps {
  warnings: string[];
}

const ConversionWarnings = ({ warnings }: ConversionWarningsProps) => {
  if (!warnings.length) return null;
  
  return (
    <div className="mt-6 w-full max-w-xl mx-auto animate-fade-in">
      <div className="glass-card p-6 border-l-4 border-amber-400">
        <div className="flex items-center mb-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 mr-2" />
          <h3 className="font-medium">Conversion Warnings</h3>
        </div>
        
        <ul className="text-sm space-y-2 text-muted-foreground">
          {warnings.map((warning, index) => (
            <li key={index} className="flex">
              <span className="mr-2">•</span>
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default ConversionWarnings;
