import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Load properties from JSON
const PROPERTIES_PATH = path.resolve('./backend/properties.json');

let PROPERTIES = [];
try {
  const data = fs.readFileSync(PROPERTIES_PATH, 'utf8');
  PROPERTIES = JSON.parse(data);
  console.log(`✓ Loaded ${PROPERTIES.length} properties`);
} catch (err) {
  console.error('✗ Error loading properties.json:', err.message);
}


const AVAILABLE_CITIES = [...new Set(PROPERTIES.map(p => p.city).filter(c => c !== 'Unknown'))];

// Enhanced locality mapping - ADD THIS
const CITY_LOCALITIES = {
  'Mumbai': ['chembur', 'mulund', 'bandra', 'andheri', 'powai', 'thane', 'malad', 'goregaon', 'kandivali', 'borivali'],
  'Pune': ['shivajinagar', 'wakad', 'hinjewadi', 'baner', 'kothrud', 'viman nagar', 'kalyani nagar', 'hadapsar', 'kharadi', 'undri']
};

const LOCALITY_TO_CITY = {};
for (const [city, localities] of Object.entries(CITY_LOCALITIES)) {
  for (const locality of localities) {
    LOCALITY_TO_CITY[locality.toLowerCase()] = city;
  }
}

// Intent detection
function isPropertyQuery(query) {
  const q = query.toLowerCase();
  const patterns = [
    /\d+\s*bhk/,
    /flat|apartment|villa|house|office/,
    /under|below|above|around.*(?:cr|crore|lakh)/,
    /ready\s*to\s*move|under\s*construction/,
    /parking|lift|furnished|balcony/
  ];
  
  // Also check for any known locality
  const hasKnownLocality = Object.keys(LOCALITY_TO_CITY).some(loc => q.includes(loc));
  
  return patterns.some(p => p.test(q)) || 
         AVAILABLE_CITIES.some(c => q.includes(c.toLowerCase())) ||
         hasKnownLocality;
}

// ENHANCED Parse filters from query
function parseQuery(query) {
  const q = query.toLowerCase();

  // Extract BHK
  const bhkMatch = q.match(/(\d+)\s*bhk/);
  const type = bhkMatch ? `${bhkMatch[1]}BHK` : null;

  // Extract status
  let status = null;
  if (/ready\s*to\s*move|possession/.test(q)) status = 'READY_TO_MOVE';
  else if (/under\s*construction/.test(q)) status = 'UNDER_CONSTRUCTION';

  // Extract budget
  let budget = null;
  const crMatch = q.match(/(?:under|below|upto|around)\s*[₹]?\s*(\d+(?:\.\d+)?)\s*(?:cr|crore)/);
  const lakhMatch = q.match(/(?:under|below|upto|around)\s*[₹]?\s*(\d+)\s*(?:lakh)/);
  if (crMatch) budget = { max: parseFloat(crMatch[1]) };
  else if (lakhMatch) budget = { max: parseFloat(lakhMatch[1]) / 100 };

  // ENHANCED: Extract city OR locality
  let city = null;
  let locality = null;
  let requestedCity = null;

  // First check for direct city match
  for (const c of AVAILABLE_CITIES) {
    if (q.includes(c.toLowerCase())) {
      city = c;
      break;
    }
  }

  // If no city found, check if it's a known locality
  if (!city) {
    for (const [localityName, parentCity] of Object.entries(LOCALITY_TO_CITY)) {
      if (q.includes(localityName)) {
        city = parentCity;  // Map locality to its parent city
        locality = localityName;  // Store the locality for filtering
        break;
      }
    }
  }

  // If still no match, extract unknown location
  if (!city) {
    const cityMatch = query.match(/\bin\s+([a-zA-Z\s]+?)(?:\s+under|\s+ready|\s+below|\s*$|\s+with)/);
    if (cityMatch) {
      requestedCity = cityMatch[1].trim();
    }
  }

  return { type, status, budget, city, locality, requestedCity };
}

// ENHANCED Filter properties with locality support
function filterProperties(filters) {
  return PROPERTIES.filter(p => {
    // City filter (required if specified)
    if (filters.city && p.city !== filters.city) return false;

    // Locality filter (if specified, search in multiple fields)
    if (filters.locality) {
      const localityLower = filters.locality.toLowerCase();
      const addressLower = (p.fullAddress || '').toLowerCase();
      const landmarkLower = (p.landmark || '').toLowerCase();
      const slugLower = (p.slug || '').toLowerCase();
      const projectNameLower = (p.projectName || '').toLowerCase();

      // Match if locality appears in ANY of these fields
      const hasLocality = 
        addressLower.includes(localityLower) ||
        landmarkLower.includes(localityLower) ||
        slugLower.includes(localityLower) ||
        projectNameLower.includes(localityLower);

      if (!hasLocality) return false;
    }

    // Type filter
    if (filters.type && p.type !== filters.type) return false;

    // Status filter
    if (filters.status && p.status !== filters.status) return false;

    // Budget filter
    if (filters.budget?.max && p.price_crores > filters.budget.max) return false;

    return true;
  });
}

// ENHANCED Generate summary with locality mention
function generateSummary(results, filters) {
  const count = results.length;
  const prices = results.map(r => r.price_crores).filter(p => p > 0).sort((a, b) => a - b);
  const ready = results.filter(r => r.status === 'READY_TO_MOVE').length;
  const localities = [...new Set(results.map(r => r.landmark || r.city).filter(Boolean))].slice(0, 3);

  let msg = `Found ${count} ${count === 1 ? 'property' : 'properties'}`;
  const parts = [];
  if (filters.type) parts.push(filters.type);
  if (filters.status) parts.push(filters.status.replace('_', ' ').toLowerCase());
  
  // Show locality if specified, otherwise show city
  if (filters.locality) parts.push(`in ${filters.locality.charAt(0).toUpperCase() + filters.locality.slice(1)}`);
  else if (filters.city) parts.push(`in ${filters.city}`);
  
  if (filters.budget?.max) parts.push(`under ₹${filters.budget.max} Cr`);

  if (parts.length) msg += ` matching ${parts.join(' ')}`;
  
  if (prices.length > 0) {
    msg += `. Prices range from ₹${prices[0]?.toFixed(2)} Cr to ₹${prices[prices.length - 1]?.toFixed(2)} Cr.`;
  }

  if (ready > 0) msg += ` ${ready} ${ready === 1 ? 'is' : 'are'} ready to move.`;
  if (localities.length) msg += ` Common areas: ${localities.join(', ')}.`;

  return msg;
}

// Call Hugging Face API for non-property queries
async function callHuggingFace(query) {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  console.log(token);
  if (!token) {
    return "I'm a property search assistant. For general questions, please add your Hugging Face API token to the .env file.";
  }

  try {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: query,
          parameters: { max_length: 100 }
        })
      }
    );

    const result = await response.json();
    if (result.error) {
      return "I'm a property search assistant. Try asking about properties like '2BHK in Mumbai under 1.5 Cr'.";
    }

    return (
      result.generated_text ||
      result[0]?.generated_text ||
      "I help you find properties. Ask me about flats, BHK types, cities, or budgets!"
    );
  } catch (error) {
    return "I'm a property search assistant specialized in finding properties from our database.";
  }
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    properties: PROPERTIES.length,
    cities: AVAILABLE_CITIES,
    localities: CITY_LOCALITIES
  });
});

app.post('/api/search', async (req, res) => {

  // console.log("search got hit!!");
  const { query } = req.body;
  console.log(query);

  if (!query?.trim()) {
    return res.json({
      message: "Please ask me something! Try '2BHK in Mumbai under 1.5 Cr' or '2BHK in Shivajinagar'",
      properties: []
    });
  }

  // Check intent
  if (!isPropertyQuery(query)) {
    if (/who\s+are\s+you/i.test(query)) {
      return res.json({
        message:
          "I'm NoBrokerage Chat Assistant! I help you find properties by understanding what you're looking for. Ask me about flats, BHK types, cities like Mumbai or Pune, localities like Shivajinagar or Chembur, budgets, or readiness status!",
        properties: []
      });
    }

    const aiResponse = await callHuggingFace(query);
    return res.json({ message: aiResponse, properties: [] });
  }

  // Property search
  const filters = parseQuery(query);

  // Only reject if it's truly an unknown location (not a known locality)
  if (filters.requestedCity && !filters.city) {
    return res.json({
      message: `Sorry, no properties available in ${filters.requestedCity}. We currently have properties in: ${AVAILABLE_CITIES.join(', ')} and localities like ${Object.keys(LOCALITY_TO_CITY).slice(0, 5).join(', ')}, etc. Try searching in one of these locations!`,
      properties: []
    });
  }

  let results = filterProperties(filters);

  if (results.length === 0) {
    // Try relaxing status filter first
    const relaxed = { ...filters, status: null };
    results = filterProperties(relaxed);

    if (results.length > 0) {
      return res.json({
        message: "No exact matches found. Showing results without status filter.",
        properties: results.slice(0, 8)
      });
    }

    // If still no results, suggest expanding
    let suggestion = "No properties match your criteria.";
    if (filters.locality) {
      suggestion = `No properties found in ${filters.locality}. Try searching in the broader ${filters.city} area or adjust your filters.`;
    }

    return res.json({
      message: suggestion,
      properties: []
    });
  }

  // Sort by price if budget specified
  if (filters.budget?.max) {
    results.sort((a, b) => a.price_crores - b.price_crores);
  }

  const summary = generateSummary(results, filters);
  res.json({ message: summary, properties: results.slice(0, 8) });
});

const PORT = process.env.PORT || 5000;


// const path = require('path');

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend/build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});


app.get("/", (req, res)=> {
  console.log("backend started");
})
app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
  console.log(`✓ Available cities: ${AVAILABLE_CITIES.join(', ')}`);
  console.log(`✓ Known localities: ${Object.keys(LOCALITY_TO_CITY).length} locations`);
});
