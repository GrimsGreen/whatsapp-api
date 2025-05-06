const qr = require('qr-image')
const { setupSession, deleteSession, reloadSession, validateSession, flushSessions, sessions } = require('../sessions')
const { sendErrorResponse, waitForNestedObject } = require('../utils')

/**
 * Starts a session for the given session ID.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID to start.
 * @returns {Promise<void>}
 * @throws {Error} If there was an error starting the session.
 */
const startSession = async (req, res) => {
  // #swagger.summary = 'Start new session'
  // #swagger.description = 'Starts a session for the given session ID.'
  const sessionId = req.params.sessionId; // Get sessionId for logging
  try {
    const setupSessionReturn = setupSession(sessionId);
    if (!setupSessionReturn.success) {
      /* #swagger.responses[422] = {
        description: "Unprocessable Entity.",
        content: {
          "application/json": {
            schema: { "$ref": "#/definitions/ErrorResponse" }
          }
        }
      }
      */
      // This is the first potential point of sending a response in this path
      sendErrorResponse(res, 422, setupSessionReturn.message);
      return;
    }

    /* #swagger.responses[200] = {
      description: "Status of the initiated session.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/StartSessionResponse" }
        }
      }
    }
    */
    // wait until the client is created
    try {
      await waitForNestedObject(setupSessionReturn.client, 'pupPage');
      // If await successfully completes, the nested object is found.
      // We must ensure headers haven't been sent by any other concurrent logic (unlikely here but good practice)
      if (!res.headersSent) {
        res.json({ success: true, message: setupSessionReturn.message });
      } else {
        console.warn(`[${sessionId}] Client ready, but headers already sent before sending success response.`);
      }
    } catch (waitError) {
      // This catch block handles rejections from waitForNestedObject,
      // such as the "Timed out waiting for nested object" error.
      console.error(`[${sessionId}] Error waiting for pupPage: ${waitError.message}`);
      if (!res.headersSent) {
        sendErrorResponse(res, 500, waitError.message);
      } else {
        // This case should ideally not be hit if the logic is correct,
        // as it means headers were sent before this error could be handled.
        console.error(`[${sessionId}] Timed out waiting for pupPage, but headers already sent. Error: ${waitError.message}`);
      }
    }
  } catch (error) { // Outer catch for errors from setupSession or other synchronous parts
  /* #swagger.responses[500] = {
      description: "Server Failure.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/ErrorResponse" }
        }
      }
    }
    */
    console.log(`[${sessionId}] startSession ERROR (outer catch):`, error);
    if (!res.headersSent) {
      sendErrorResponse(res, 500, error.message);
    }
  }
}

/**
 * Status of the session with the given session ID.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID to start.
 * @returns {Promise<void>}
 * @throws {Error} If there was an error getting status of the session.
 */
const statusSession = async (req, res) => {
  // #swagger.summary = 'Get session status'
  // #swagger.description = 'Status of the session with the given session ID.'
  const sessionId = req.params.sessionId;
  try {
    const sessionData = await validateSession(sessionId);
    /* #swagger.responses[200] = {
      description: "Status of the session.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/StatusSessionResponse" }
        }
      }
    }
    */
    if (!res.headersSent) {
      res.json(sessionData);
    }
  } catch (error) {
    console.log(`[${sessionId}] statusSession ERROR`, error);
    /* #swagger.responses[500] = {
      description: "Server Failure.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/ErrorResponse" }
        }
      }
    }
    */
    if (!res.headersSent) {
      sendErrorResponse(res, 500, error.message);
    }
  }
}

/**
 * QR code of the session with the given session ID.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID to start.
 * @returns {Promise<void>}
 * @throws {Error} If there was an error getting status of the session.
 */
const sessionQrCode = async (req, res) => {
  // #swagger.summary = 'Get session QR code'
  // #swagger.description = 'QR code of the session with the given session ID.'
  const sessionId = req.params.sessionId;
  try {
    const session = sessions.get(sessionId);
    if (!res.headersSent) {
      if (!session) {
        res.json({ success: false, message: 'session_not_found' }); // Corrected: Removed return before res.json
        return;
      }
      if (session.qr) {
        res.json({ success: true, qr: session.qr });
        return;
      }
      res.json({ success: false, message: 'qr code not ready or already scanned' });
    }
  } catch (error) {
    console.log(`[${sessionId}] sessionQrCode ERROR`, error);
    /* #swagger.responses[500] = {
      description: "Server Failure.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/ErrorResponse" }
        }
      }
    }
    */
    if (!res.headersSent) {
      sendErrorResponse(res, 500, error.message);
    }
  }
}

/**
 * QR code as image of the session with the given session ID.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID to start.
 * @returns {Promise<void>}
 * @throws {Error} If there was an error getting status of the session.
 */
const sessionQrCodeImage = async (req, res) => {
  // #swagger.summary = 'Get session QR code as image'
  // #swagger.description = 'QR code as image of the session with the given session ID.'
  const sessionId = req.params.sessionId;
  try {
    const session = sessions.get(sessionId);
    if (!res.headersSent) {
      if (!session) {
        res.json({ success: false, message: 'session_not_found' }); // Corrected: Removed return before res.json
        return;
      }
      if (session.qr) {
        const qrImage = qr.image(session.qr);
        /* #swagger.responses[200] = {
            description: "QR image.",
            content: {
              "image/png": {}
            }
          }
        */
        res.writeHead(200, { // writeHead sends headers immediately
          'Content-Type': 'image/png'
        });
        qrImage.pipe(res); // This will also end the response
        return; // Return after piping
      }
      res.json({ success: false, message: 'qr code not ready or already scanned' });
    }
  } catch (error) {
    console.log(`[${sessionId}] sessionQrCodeImage ERROR`, error);
    /* #swagger.responses[500] = {
      description: "Server Failure.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/ErrorResponse" }
        }
      }
    }
    */
    // If error occurs after res.writeHead, we can't send a JSON error.
    // The pipe might also have issues. Node might terminate the request abruptly.
    if (!res.headersSent) {
      sendErrorResponse(res, 500, error.message);
    } else {
      console.error(`[${sessionId}] Error in sessionQrCodeImage after headers sent: ${error.message}`);
      // If response is not finished, try to end it.
      if (!res.writableEnded) {
        res.end();
      }
    }
  }
}

/**
 * Restarts the session with the given session ID.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID to terminate.
 * @returns {Promise<void>}
 * @throws {Error} If there was an error terminating the session.
 */
const restartSession = async (req, res) => {
  // #swagger.summary = 'Restart session'
  // #swagger.description = 'Restarts the session with the given session ID.'
  const sessionId = req.params.sessionId;
  try {
    const validation = await validateSession(sessionId);
    if (!res.headersSent) {
      if (validation.message === 'session_not_found') {
        res.json(validation); // Corrected: Removed return before res.json
        return;
      }
      await reloadSession(sessionId);
      /* #swagger.responses[200] = {
        description: "Sessions restarted.",
        content: {
          "application/json": {
            schema: { "$ref": "#/definitions/RestartSessionResponse" }
          }
        }
      }
      */
      res.json({ success: true, message: 'Restarted successfully' });
    }
  } catch (error) {
    /* #swagger.responses[500] = {
      description: "Server Failure.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/ErrorResponse" }
        }
      }
    }
    */
    console.log(`[${sessionId}] restartSession ERROR`, error);
    if (!res.headersSent) {
      sendErrorResponse(res, 500, error.message);
    }
  }
}

/**
 * Terminates the session with the given session ID.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID to terminate.
 * @returns {Promise<void>}
 * @throws {Error} If there was an error terminating the session.
 */
const terminateSession = async (req, res) => {
  // #swagger.summary = 'Terminate session'
  // #swagger.description = 'Terminates the session with the given session ID.'
  const sessionId = req.params.sessionId;
  try {
    const validation = await validateSession(sessionId);
    if (!res.headersSent) {
      if (validation.message === 'session_not_found') {
        res.json(validation); // Corrected: Removed return before res.json
        return;
      }
      await deleteSession(sessionId, validation);
      /* #swagger.responses[200] = {
        description: "Sessions terminated.",
        content: {
          "application/json": {
            schema: { "$ref": "#/definitions/TerminateSessionResponse" }
          }
        }
      }
      */
      res.json({ success: true, message: 'Logged out successfully' });
    }
  } catch (error) {
    /* #swagger.responses[500] = {
      description: "Server Failure.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/ErrorResponse" }
        }
      }
    }
    */
    console.log(`[${sessionId}] terminateSession ERROR`, error);
    if (!res.headersSent) {
      sendErrorResponse(res, 500, error.message);
    }
  }
}

/**
 * Terminates all inactive sessions.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<void>}
 * @throws {Error} If there was an error terminating the sessions.
 */
const terminateInactiveSessions = async (req, res) => {
  // #swagger.summary = 'Terminate inactive sessions'
  // #swagger.description = 'Terminates all inactive sessions.'
  try {
    await flushSessions(true);
    /* #swagger.responses[200] = {
      description: "Sessions terminated.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/TerminateSessionsResponse" }
        }
      }
    }
    */
    if (!res.headersSent) {
      res.json({ success: true, message: 'Flush completed successfully' });
    }
  } catch (error) {
    /* #swagger.responses[500] = {
      description: "Server Failure.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/ErrorResponse" }
        }
      }
    }
    */
    console.log('terminateInactiveSessions ERROR', error);
    if (!res.headersSent) {
      sendErrorResponse(res, 500, error.message);
    }
  }
}

/**
 * Terminates all sessions.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<void>}
 * @throws {Error} If there was an error terminating the sessions.
 */
const terminateAllSessions = async (req, res) => {
  // #swagger.summary = 'Terminate all sessions'
  // #swagger.description = 'Terminates all sessions.'
  try {
    await flushSessions(false);
    /* #swagger.responses[200] = {
      description: "Sessions terminated.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/TerminateSessionsResponse" }
        }
      }
    }
    */
    if (!res.headersSent) {
      res.json({ success: true, message: 'Flush completed successfully' });
    }
  } catch (error) {
  /* #swagger.responses[500] = {
      description: "Server Failure.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/ErrorResponse" }
        }
      }
    }
    */
    console.log('terminateAllSessions ERROR', error);
    if (!res.headersSent) {
      sendErrorResponse(res, 500, error.message);
    }
  }
}

module.exports = {
  startSession,
  statusSession,
  sessionQrCode,
  sessionQrCodeImage,
  restartSession,
  terminateSession,
  terminateInactiveSessions,
  terminateAllSessions
}
