import pool from '../config/db.js';

const generateShareMessage = async (req, res) => {
  try {
    const { message_type, content } = req.body;
    
    if (!message_type || !content) {
      return res.status(400).json({ message: 'message_type and content are required' });
    }
    
    // Get current date in Indian format
    const currentDate = new Date().toLocaleDateString('hi-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric'
    });
    
    // Create header with current date
    const header = `📅 ${currentDate}`;
    
    // Generate complete share message
    const shareMessage = `${header}\n\n${content}`;
    
    res.json({
      message: 'Share message generated successfully',
      data: {
        header: header,
        content: content,
        complete_message: shareMessage,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('GENERATE SHARE MESSAGE ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};

export { generateShareMessage };