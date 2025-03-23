
import React from 'react';
import { Github, Heart } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="w-full py-8 mt-12">
      <div className="max-w-4xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between glass-card p-4">
          <p className="text-sm text-muted-foreground mb-4 md:mb-0">
            Built with precision and care for API developers
          </p>
          
          <div className="flex items-center space-x-4">
            <a 
              href="https://github.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              aria-label="GitHub"
            >
              <Github className="h-5 w-5" />
            </a>
            <span className="text-sm text-muted-foreground flex items-center">
              Made with <Heart className="h-3 w-3 mx-1 text-destructive" /> by Lovable
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
