
import React, { useState } from 'react';
import { ApiVisualizerData, ApiEndpoint } from '@/lib/apiVisualizer';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Eye, EyeOff, FileText, LayoutGrid, LayoutList } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ApiVisualizerProps {
  data: ApiVisualizerData;
  isOpen: boolean;
  onClose: () => void;
}

const methodColors: Record<string, string> = {
  GET: 'bg-blue-500/20 text-blue-600 dark:bg-blue-500/30 dark:text-blue-300',
  POST: 'bg-green-500/20 text-green-600 dark:bg-green-500/30 dark:text-green-300',
  PUT: 'bg-yellow-500/20 text-yellow-600 dark:bg-yellow-500/30 dark:text-yellow-300',
  DELETE: 'bg-red-500/20 text-red-600 dark:bg-red-500/30 dark:text-red-300',
  PATCH: 'bg-purple-500/20 text-purple-600 dark:bg-purple-500/30 dark:text-purple-300',
  OPTIONS: 'bg-gray-500/20 text-gray-600 dark:bg-gray-500/30 dark:text-gray-300',
  HEAD: 'bg-gray-500/20 text-gray-600 dark:bg-gray-500/30 dark:text-gray-300',
};

const ApiVisualizer: React.FC<ApiVisualizerProps> = ({ data, isOpen, onClose }) => {
  const [viewType, setViewType] = useState<'list' | 'grid'>('list');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  
  // Extract all unique tags
  const allTags = Array.from(
    new Set(
      data.endpoints
        .flatMap(endpoint => endpoint.tags || [])
        .filter(Boolean)
    )
  );

  // Filter endpoints by selected tag
  const filteredEndpoints = selectedTag 
    ? data.endpoints.filter(endpoint => endpoint.tags?.includes(selectedTag))
    : data.endpoints;

  const toggleViewType = () => {
    setViewType(viewType === 'list' ? 'grid' : 'list');
  };

  const handleTagSelect = (tag: string | null) => {
    setSelectedTag(tag);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="glass max-w-4xl w-[90vw] max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <FileText className="h-5 w-5" />
            API Visualization
          </DialogTitle>
          <DialogDescription>
            {data.title} - v{data.version}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleViewType}
              className="glass-button p-2"
              aria-label={`Switch to ${viewType === 'list' ? 'grid' : 'list'} view`}
            >
              {viewType === 'list' ? <LayoutGrid className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}
            </button>
          </div>

          {allTags.length > 0 && (
            <Tabs value={selectedTag || 'all'} className="w-auto">
              <TabsList className="glass">
                <TabsTrigger 
                  value="all" 
                  onClick={() => handleTagSelect(null)}
                >
                  All
                </TabsTrigger>
                {allTags.map(tag => (
                  <TabsTrigger 
                    key={tag} 
                    value={tag}
                    onClick={() => handleTagSelect(tag)}
                  >
                    {tag}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </div>
        
        <ScrollArea className="h-[60vh] pr-4">
          {viewType === 'list' ? (
            <div className="space-y-3">
              {filteredEndpoints.map((endpoint, index) => (
                <Card key={index} className="glass">
                  <CardHeader className="py-3">
                    <div className="flex justify-between items-start">
                      <div className="flex gap-2 items-center">
                        <span className={`text-xs font-mono px-2 py-1 rounded ${methodColors[endpoint.method] || 'bg-gray-200'}`}>
                          {endpoint.method}
                        </span>
                        <CardTitle className="text-sm font-mono">{endpoint.path}</CardTitle>
                      </div>
                      {endpoint.tags && endpoint.tags.length > 0 && (
                        <div className="flex gap-1">
                          {endpoint.tags.map(tag => (
                            <span key={tag} className="text-xs bg-primary/10 px-2 py-0.5 rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="py-2">
                    <p className="text-sm text-muted-foreground">{endpoint.summary}</p>
                    {endpoint.operationId && (
                      <p className="text-xs text-muted-foreground mt-1">Operation: {endpoint.operationId}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredEndpoints.map((endpoint, index) => (
                <Card key={index} className="glass">
                  <CardHeader className="py-3">
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2 items-center">
                        <span className={`text-xs font-mono px-2 py-1 rounded ${methodColors[endpoint.method] || 'bg-gray-200'}`}>
                          {endpoint.method}
                        </span>
                        <CardTitle className="text-sm font-mono truncate">{endpoint.path}</CardTitle>
                      </div>
                      {endpoint.tags && endpoint.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {endpoint.tags.map(tag => (
                            <span key={tag} className="text-xs bg-primary/10 px-2 py-0.5 rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="py-2">
                    <p className="text-sm text-muted-foreground line-clamp-2">{endpoint.summary}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          
          {filteredEndpoints.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40">
              <p className="text-muted-foreground">No endpoints found</p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default ApiVisualizer;
