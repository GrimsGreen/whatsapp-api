const qr = require('qr-image');
const { setupSession, deleteSession, reloadSession, validateSession, flushSessions, sessions } = require('../sessions');
// Make sure this path is correct and utils.js exports these
const { sendErrorResponse, waitForNestedObject } = require('../utils');

/**
 * Wraps response methods for logging. Use for debugging only.
 */
function wrapResponseForDebugging(res, sessionId) {
  const originalJson = res.json;
  res.json = function(...args) {
    const stack = new Error().stack.split('\n')[2].trim();
    console.log(`[${sessionId}] DEBUG: res.json called. res.headersSent: ${this.headersSent}. Args: ${JSON.stringify(args)}. Called from: ${stack}`);
    if (this.headersSent) {
      console.error(`[${sessionId}] DEBUG: res.json called BUT HEADERS ALREADY SENT! Called from: ${stack}`);
    }
    return originalJson.apply(this, args);
  };

  const originalSend = res.send;
  res.send = function(...args) {
    const stack = new Error().stack.split('\n')[2].trim();
    console.log(`[${sessionId}] DEBUG: res.send called. res.headersSent: ${this.headersSent}. Called from: ${stack}`);
     if (this.headersSent) {
      console.error(`[${sessionId}] DEBUG: res.send called BUT HEADERS ALREADY SENT! Called from: ${stack}`);
    }
    return originalSend.apply(this, args);
  };

  const originalWriteHead = res.writeHead;
  res.writeHead = function(...args) {
    const stack = new Error().stack.split('\n')[2].trim();
    console.log(`[${sessionId}] DEBUG: res.writeHead called. res.headersSent: ${this.headersSent}. Args: ${JSON.stringify(args)}. Called from: ${stack}`);
    if (this.headersSent) {
      console.error(`[${sessionId}] DEBUG: res.writeHead called BUT HEADERS ALREADY SENT! Called from: ${stack}`);
    }
    return originalWriteHead.apply(this, args);
  };
   const originalEnd = res.end;
   res.end = function(...args) {
    const stack = new Error().stack.split('\n')[2].trim();
    console.log(`[${sessionId}] DEBUG: res.end called. res.headersSent: ${this.headersSent}. res.writableEnded: ${this.writableEnded}. Called from: ${stack}`);
    if (this.headersSent && this.writableEnded) {
       console.warn(`[${sessionId}] DEBUG: res.end called but response already ended and headers sent. Called from: ${stack}`);
    }
    return originalEnd.apply(this, args);
  };
}


const startSession = async (req, res) => {
  const sessionId = req.params.sessionId;
  // wrapResponseForDebugging(res, sessionId); // UNCOMMENT FOR VERY VERBOSE DEBUGGING

  console.log(`[${sessionId}] startSession: ENTER. res.headersSent: ${res.headersSent}`);

  // This flag helps ensure this handler instance only tries to send one response.
  let thisHandlerResponded = false;

  try {
    console.log(`[${sessionId}] startSession: Before setupSession. res.headersSent: ${res.headersSent}`);
    const setupSessionReturn = setupSession(sessionId); // Presumed synchronous
    console.log(`[${sessionId}] startSession: After setupSession. Success: ${setupSessionReturn.success}. res.headersSent: ${res.headersSent}`);

    if (thisHandlerResponded || res.headersSent) { // Check if setupSession itself (if async or evented) responded
        console.warn(`[${sessionId}] startSession: Response already sent after setupSession call but before explicit send. thisHandlerResponded: ${thisHandlerResponded}, res.headersSent: ${res.headersSent}`);
        return;
    }

    if (!setupSessionReturn.success) {
      console.log(`[${sessionId}] startSession: setupSession failed. Attempting to send 422.`);
      if (!res.headersSent) {
        thisHandlerResponded = true;
        sendErrorResponse(res, 422, setupSessionReturn.message);
      } else {
        console.error(`[${sessionId}] startSession: setupSession failed, but headers ALREADY SENT before sending 422.`);
      }
      return;
    }

    console.log(`[${sessionId}] startSession: Before waitForNestedObject. res.headersSent: ${res.headersSent}`);
    try {
      // Ensure client exists before passing to waitForNestedObject
      if (!setupSessionReturn.client) {
          throw new Error("setupSession did not return a client object.");
      }
      await waitForNestedObject(setupSessionReturn.client, 'pupPage'); // This is an async operation
      console.log(`[${sessionId}] startSession: waitForNestedObject RESOLVED. res.headersSent: ${res.headersSent}`);

      if (!res.headersSent) {
        thisHandlerResponded = true;
        console.log(`[${sessionId}] startSession: Attempting to send SUCCESS response.`);
        res.json({ success: true, message: setupSessionReturn.message });
      } else {
        console.error(`[${sessionId}] startSession: waitForNestedObject resolved, but headers ALREADY SENT before sending success.`);
      }
    } catch (waitError) { // This is where "Timed out waiting for nested object" comes
      console.error(`[${sessionId}] startSession: CATCH for waitForNestedObject. Error: "${waitError.message}". res.headersSent: ${res.headersSent}`);
      if (!res.headersSent) {
        thisHandlerResponded = true;
        console.log(`[${sessionId}] startSession: Attempting to send 500 error for waitError.`);
        // This is line ~47 from original problem, now wrapped with more checks
        sendErrorResponse(res, 500, waitError.message);
      } else {
        console.error(`[${sessionId}] startSession: CATCH for waitForNestedObject, but headers ALREADY SENT. Error: "${waitError.message}"`);
      }
    }
  } catch (error) { // Outer catch for synchronous errors in setupSession or unexpected issues
    console.error(`[${sessionId}] startSession: OUTER CATCH. Error: "${error.message}". res.headersSent: ${res.headersSent}`, error.stack);
    if (!thisHandlerResponded && !res.headersSent) {
      // Avoid double response if inner try/catch already handled it.
      thisHandlerResponded = true;
      sendErrorResponse(res, 500, error.message);
    } else {
       console.error(`[${sessionId}] startSession: OUTER CATCH, but response already attempted/sent or headers sent. Error: "${error.message}"`);
    }
  } finally {
      console.log(`[${sessionId}] startSession: FINALLY. thisHandlerResponded: ${thisHandlerResponded}, res.headersSent: ${res.headersSent}, res.writableEnded: ${res.writableEnded}`);
      // If this handler thought it sent a response, but the response stream is still open,
      // it might indicate an issue in sendErrorResponse or res.json not ending the stream.
      // However, generally, `res.json` and `sendErrorResponse` should handle `res.end()`.
  }
};

// ... (rest of your controller functions, apply similar logging if needed)
const statusSession = async (req, res) => {
  const sessionId = req.params.sessionId;
  console.log(`[${sessionId}] statusSession: ENTER. res.headersSent: ${res.headersSent}`);
  try {
    const sessionData = await validateSession(sessionId);
    if (!res.headersSent) {
      res.json(sessionData);
    } else {
      console.error(`[${sessionId}] statusSession: Headers already sent before sending data.`);
    }
  } catch (error) {
    console.error(`[${sessionId}] statusSession: CATCH. Error: ${error.message}. res.headersSent: ${res.headersSent}`);
    if (!res.headersSent) {
      sendErrorResponse(res, 500, error.message);
    }
  }
};

const sessionQrCode = async (req, res) => {
  const sessionId = req.params.sessionId;
  console.log(`[${sessionId}] sessionQrCode: ENTER. res.headersSent: ${res.headersSent}`);
  try {
    const session = sessions.get(sessionId);
    if (!res.headersSent) {
      if (!session) {
        res.status(404).json({ success: false, message: 'session_not_found' });
        return;
      }
      if (session.qr) {
        res.json({ success: true, qr: session.qr });
        return;
      }
      res.status(200).json({ success: false, message: 'qr code not ready or already scanned' }); // 200 for "not ready yet" is debatable, maybe 202 or 404
    } else {
      console.error(`[${sessionId}] sessionQrCode: Headers already sent.`);
    }
  } catch (error) {
    console.error(`[${sessionId}] sessionQrCode: CATCH. Error: ${error.message}. res.headersSent: ${res.headersSent}`);
    if (!res.headersSent) {
      sendErrorResponse(res, 500, error.message);
    }
  }
};

const sessionQrCodeImage = async (req, res) => {
  const sessionId = req.params.sessionId;
  console.log(`[${sessionId}] sessionQrCodeImage: ENTER. res.headersSent: ${res.headersSent}`);
  try {
    const session = sessions.get(sessionId);
    if (res.headersSent) {
      console.error(`[${sessionId}] sessionQrCodeImage: Headers already sent at entry.`);
      // Cannot reliably send error if headers are for an image already.
      if (!res.writableEnded) res.end();
      return;
    }

    if (!session) {
      res.status(404).json({ success: false, message: 'session_not_found' });
      return;
    }
    if (session.qr) {
      const qrImage = qr.image(session.qr, { type: 'png' }); // Specify type for qr.image
      res.writeHead(200, { 'Content-Type': 'image/png' }); // This sends headers
      qrImage.pipe(res); // This sends body and ends response
      // No return needed after pipe if it's the last action.
    } else {
      res.status(200).json({ success: false, message: 'qr code not ready or already scanned' });
    }
  } catch (error) {
    console.error(`[${sessionId}] sessionQrCodeImage: CATCH. Error: ${error.message}. res.headersSent: ${res.headersSent}`);
    if (!res.headersSent) { // Only send JSON error if headers not yet set for image
      sendErrorResponse(res, 500, error.message);
    } else {
      // Headers were sent (likely for the image), but an error occurred during/after.
      // Best we can do is try to end the response if it's not already.
      console.error(`[${sessionId}] sessionQrCodeImage: Error after headers sent (e.g. pipe error). Ending response.`);
      if (!res.writableEnded) {
        res.end();
      }
    }
  }
};

// Apply similar logging patterns (ENTER, CATCH, res.headersSent checks) to other handlers:
// restartSession, terminateSession, terminateInactiveSessions, terminateAllSessions

module.exports = {
  startSession,
  statusSession,
  sessionQrCode,
  sessionQrCodeImage,
  restartSession, // Add logging
  terminateSession, // Add logging
  terminateInactiveSessions, // Add logging
  terminateAllSessions // Add logging
};
