const express = require('express');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const net = require('net');
const http = require('http');

// Import rate limiter middleware
const limiter = require('./middleware/rateLimiter');

// Add near the top of the file, before any routes
// Load environment variables
require('dotenv').config();

// Validate API key early
if (!process.env.OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY is not defined in environment variables');
  console.error('Please create a .env file with your API key or set it in your environment');
  // Continue execution but log clear error
}

const app = express();
const DEFAULT_PORT = 3001;

// Add before other code, for debugging only
console.log('API key prefix:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.slice(0, 5) + '...' : 'undefined');

// Function to find available port
function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });
    
    server.listen(startPort, () => {
      server.close(() => {
        resolve(startPort);
      });
    });
  });
}

// Middleware
app.use(cors());
app.use(express.json());

// Apply rate limiter - before all routes
app.use('/api', limiter);

// Static file service
app.use(express.static('public'));

// LLM API proxy route
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    // Verify API key before making request
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'API key not configured',
        message: 'The server is missing API credentials. Please check server configuration.'
      });
    }
    
    // Set response headers to support streaming
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Connect to LLM API (example using OpenAI API)
    const response = await axios({
      method: 'post',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      data: {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: message }],
        stream: true
      },
      responseType: 'stream'
    });
    
    // Don't pipe the response directly, parse SSE format
    response.data.on('data', (chunk) => {
      // Convert binary data to text
      const textChunk = chunk.toString();
      
      // Process multiple lines (may contain multiple SSE events)
      const lines = textChunk.split('\n');
      
      for (const line of lines) {
        // Check if it's a data line
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6); // Remove 'data: '
          
          // Check if it's a [DONE] message
          if (jsonStr.trim() === '[DONE]') {
            return;
          }
          
          try {
            // Parse JSON
            const json = JSON.parse(jsonStr);
            
            // Extract text content
            const content = json.choices?.[0]?.delta?.content || '';
            
            // Only send actual content
            if (content) {
              res.write(content);
            }
          } catch (e) {
            // Ignore JSON parsing failures
            console.error('JSON parse error:', e);
          }
        }
      }
    });
    
    // Handle end of stream
    response.data.on('end', () => {
      res.end();
    });
    
    // Error handling
    response.data.on('error', (error) => {
      console.error('Stream processing error:', error);
      res.end('Data stream error');
    });
    
  } catch (error) {
    console.error('API request error:', error.message);
    
    // Check for specific error types
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Status:', error.response.status);
      console.error('Headers:', JSON.stringify(error.response.headers));
      
      if (error.response.status === 401) {
        return res.status(500).json({ 
          error: 'Authentication failed',
          message: 'API key invalid or expired. Please check server configuration.'
        });
      }
    }
    
    // Return appropriate error response
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Error communicating with LLM service',
        message: error.message
      });
    } else {
      // If headers were already sent, try to write error message to stream
      try {
        res.write('\n\nError occurred: ' + error.message);
        res.end();
      } catch (e) {
        console.error('Failed to write error to response:', e);
      }
    }
  }
});

// Find available port and start server
findAvailablePort(DEFAULT_PORT)
  .then(port => {
    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  })
  .catch(err => {
    console.error('Unable to start server:', err);
  });