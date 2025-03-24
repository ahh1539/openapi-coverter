
import * as yaml from 'js-yaml';

export interface ApiEndpoint {
  path: string;
  method: string;
  summary: string;
  operationId?: string;
  tags?: string[];
}

export interface ApiVisualizerData {
  title: string;
  version: string;
  endpoints: ApiEndpoint[];
}

export const parseApiSpec = (yamlContent: string): ApiVisualizerData => {
  try {
    const parsed = yaml.load(yamlContent) as any;
    const result: ApiVisualizerData = {
      title: parsed.info?.title || 'API',
      version: parsed.info?.version || '1.0.0',
      endpoints: [],
    };

    // Handle both OpenAPI 3.x and Swagger 2.0
    const paths = parsed.paths || {};
    
    Object.keys(paths).forEach(path => {
      const pathItem = paths[path];
      
      Object.keys(pathItem).forEach(method => {
        if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) {
          const operation = pathItem[method];
          
          result.endpoints.push({
            path,
            method: method.toUpperCase(),
            summary: operation.summary || operation.description || path,
            operationId: operation.operationId,
            tags: operation.tags,
          });
        }
      });
    });

    return result;
  } catch (error) {
    console.error('Error parsing API spec:', error);
    return {
      title: 'Error parsing API',
      version: '',
      endpoints: [],
    };
  }
};
