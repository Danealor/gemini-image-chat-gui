# Gemini 3 Image Pro Chat GUI

A modern Node.js web application that provides an AI Studio-style chat interface for generating and editing images using Google's Gemini 3 Image Pro (Nano Banana Pro) through the AI/ML API.

## Features

### Chat Interface
- Modern dark theme inspired by AI Studio
- Clean, inline message layout (not messenger-style left/right)
- Preserves newlines in prompts for better readability
- Responsive design with mobile sidebar toggle

### Image Generation
- Support for both Nano Banana Pro Edit and Gemini 3 Pro Image Preview Edit models
- Generate 1-4 images per request
- Multiple image input methods:
  - Upload local images
  - Provide image URLs
- View generated images directly in the chat
- Click images to open in full-size lightbox with version navigation

### Version Management
- **Regenerate** - Create multiple versions of the same generation
- **Version Navigation** - Arrow buttons to switch between regeneration versions
- **Lightbox Version Switching** - Navigate versions within the preview window
- Smooth fade animations when switching versions

### Message Management
- **Edit messages** - Modify prompts and regenerate
- **Add images** - Add more images to existing messages
- **Remove images** - Remove individual images from messages
- **Copy to New Chat** - Copy a prompt and its images to start a new chat

### Chat History
- **Server-side storage** - No more 5MB localStorage limitations
- Persistent chat history stored on the server's file system
- Images stored locally (both uploaded and generated)
- Sidebar organized by date (Today, Yesterday, older dates)
- Switch between chats easily
- Delete old chats (with protection against deleting the last chat)
- Start new chats anytime

## Prerequisites

- Node.js (v14 or higher)
- AI/ML API key (get one from [aimlapi.com](https://aimlapi.com))

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

4. Edit the `.env` file and add your AI/ML API key:
```
AIML_API_KEY=your_actual_api_key_here
```

## Usage

1. Start the server:
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

3. Use the interface:
   - **New Chat**: Click the "New Chat" button in the sidebar to start fresh
   - **Select Model**: Choose between Nano Banana Pro Edit or Gemini 3 Pro Image Preview Edit
   - **Number of Images**: Set how many images to generate (1-4)
   - **Upload Images** (optional): Click "Upload Images" to select local images for editing
   - **Add Image URLs** (optional): Enter image URLs and press Enter to add them
   - **Enter Prompt**: Describe what you want to generate or how to edit the images
   - **Click Generate**: Submit your request

4. Manage messages:
   - Hover over any message to see action buttons
   - **Edit**: Modify the prompt text
   - **Add Image**: Add more images to the message
   - **Regenerate**: Generate new versions with the same settings
   - **Copy to New Chat**: Start a new chat with the same prompt and images
   - **Version Arrows**: Navigate between different regeneration versions

## Testing

Run the comprehensive test suite:
```bash
npm test
```

Run tests with visible browser:
```bash
npm run test:headed
```

The test suite includes:
- Chat creation and persistence
- Image upload and storage
- Generated image handling
- Regeneration functionality
- Message editing
- Multi-chat management
- External URL handling

## Example Prompts

### Image Generation
```
A futuristic cityscape at sunset with flying cars
```

### Image Editing (with uploaded images)
```
Make this image look like a watercolor painting
```

### Image Combination (with multiple images)
```
Combine the images so the person is sitting on the beach at sunset
```

## API Reference

This application uses the AI/ML API's image generation endpoint:

- **Endpoint**: `https://api.aimlapi.com/v1/images/generations`
- **Models**:
  - `google/nano-banana-pro-edit`
  - `google/gemini-3-pro-image-preview-edit`

For more information, see the [AI/ML API Documentation](https://docs.aimlapi.com/api-references/image-models/google/gemini-3-pro-image-preview-edit).

## Project Structure

```
AIMLAPIGUI/
├── public/
│   ├── index.html          # Main HTML interface
│   ├── style.css           # Dark theme styling
│   ├── app.js              # Client-side JavaScript with chat management
│   └── storage-service.js  # Client-side API wrapper for storage
├── tests/
│   ├── storage-migration.spec.js  # Playwright test suite
│   └── test-server.js             # Test server with stubbed API
├── storage.js              # Server-side file system storage module
├── server.js               # Express server with RESTful API
├── playwright.config.js    # Playwright test configuration
├── package.json            # Dependencies
├── .env.example            # Environment variables template
└── README.md               # This file
```

## Data Storage

Chat history and images are stored on the server's file system in the `data/` directory:

```
data/
├── chats/           # Chat JSON files (one per chat)
└── images/
    ├── input/       # User-uploaded images
    └── generated/   # AI-generated images
```

This means:
- No browser storage limitations (was 5MB with localStorage)
- Data persists on the server
- Images stored with unique filenames to prevent conflicts
- All data is in the `data/` directory (excluded from git)

## Dependencies

### Runtime Dependencies
- **express**: Web server framework
- **dotenv**: Environment variable management
- **multer**: File upload handling
- **form-data**: Multipart form data construction
- **node-fetch**: HTTP requests to AI/ML API

### Development Dependencies
- **nodemon**: Auto-restart during development
- **@playwright/test**: Browser automation testing

### Key Learnings
- **No database required**: Simple file system storage works great for this use case
- **FormData handling**: The AI/ML API requires multipart form data for image uploads
- **Image processing**: Server-stored images need to be fetched as blobs and re-sent to the API
- **Async/await**: All storage operations are asynchronous for better performance
- **Testing**: Playwright provides excellent browser automation with minimal setup

## Troubleshooting

### "API key not configured" error
- Make sure you created a `.env` file (not `.env.example`)
- Verify your API key is correctly set in the `.env` file
- Restart the server after adding the API key

### Images not generating
- Check that you have sufficient credits in your AI/ML API account
- Verify your API key is valid
- Check the browser console and server logs for error messages

### Server won't start
- Make sure port 3000 is not already in use
- Run `npm install` to ensure all dependencies are installed
- Check for any error messages in the terminal

### Chat history not loading
- Check that the server is running
- Verify the `data/` directory exists and has proper permissions
- Check browser console for network errors

### Tests failing
- Make sure test server port 3001 is available
- Run `npm install` to ensure @playwright/test is installed
- Check that you have the latest Playwright browsers: `npx playwright install`

## License

MIT

## Contributing

Feel free to submit issues and enhancement requests!
