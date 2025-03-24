const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

// Assuming OpenAI API is used (please replace with your actual LLM API)
const LLM_API_URL = 'https://api.openai.com/v1/chat/completions';
const API_KEY = process.env.LLM_API_KEY;

router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    // Set response as streaming
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Request LLM API (OpenAI example)
    const response = await fetch(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: message }],
        stream: true
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to call LLM API');
    }

    // Handle streaming response
    const reader = response.body.getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      // Parse data and send to client
      // Note: OpenAI's streaming response requires special handling, simplified here
      const chunk = Buffer.from(value).toString('utf8');
      const lines = chunk.split('\n').filter(line => line.trim() !== '' && line.trim() !== 'data: [DONE]');
      
      for (const line of lines) {
        if (line.includes('data: ')) {
          try {
            const data = JSON.parse(line.replace('data: ', ''));
            if (data.choices && data.choices[0].delta.content) {
              res.write(data.choices[0].delta.content);
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        }
      }
    }
    
    res.end();
  } catch (error) {
    console.error('API error:', error);
    // If headers are already sent, we can't send a status code
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write('\n\nError occurred: ' + error.message);
      res.end();
    }
  }
});

module.exports = router; 