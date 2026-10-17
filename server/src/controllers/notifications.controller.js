import { destinationService } from '../services/notifications/destination.service.js';
import { deliveryService } from '../services/notifications/delivery.service.js';

export const notificationsController = {
  /**
   * GET /api/notifications/destinations
   */
  async listDestinations(req, res, next) {
    try {
      const is_active = req.query.is_active !== undefined ? req.query.is_active === 'true' : null;
      const destinations = await destinationService.listDestinations(req.query.workspace_id, { is_active });
      res.status(200).json({
        success: true,
        data: destinations
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/notifications/destinations
   */
  async createDestination(req, res, next) {
    try {
      const destination = await destinationService.createDestination(req.body);
      res.status(201).json({
        success: true,
        data: destination
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/notifications/destinations/:id
   */
  async getDestinationById(req, res, next) {
    try {
      const destination = await destinationService.getDestinationById(req.params.id);
      res.status(200).json({
        success: true,
        data: destination
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/notifications/destinations/:id
   */
  async updateDestination(req, res, next) {
    try {
      const updated = await destinationService.updateDestination(req.params.id, req.body);
      res.status(200).json({
        success: true,
        data: updated
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/notifications/destinations/:id
   */
  async deleteDestination(req, res, next) {
    try {
      await destinationService.deleteDestination(req.params.id);
      res.status(200).json({
        success: true,
        message: 'Destination deleted successfully'
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/notifications/destinations/:id/test
   */
  async testDestination(req, res, next) {
    try {
      const delivery = await destinationService.testDestination(req.params.id);
      res.status(200).json({
        success: delivery.status === 'delivered',
        data: delivery
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/notifications/deliveries
   */
  async listDeliveries(req, res, next) {
    try {
      const result = await deliveryService.listDeliveries(req.query);
      res.status(200).json({
        success: true,
        data: result.deliveries,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/notifications/deliveries/:id/retry
   */
  async retryDelivery(req, res, next) {
    try {
      const retried = await deliveryService.retryDelivery(req.params.id);
      res.status(200).json({
        success: retried.status === 'delivered',
        data: retried
      });
    } catch (err) {
      next(err);
    }
  }
};
