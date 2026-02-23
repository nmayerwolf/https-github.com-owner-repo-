const express = require('express');
const { query } = require('../config/db');
const { badRequest, notFound } = require('../utils/errors');

const router = express.Router();

const formatMoney = (value) => {
  if (value === null || value === undefined) return 'N/D';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'N/D';
  return `$${n.toFixed(2)}`;
};

const formatPercent = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'N/D';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
};

const escapePdfText = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const buildSimplePdf = (lines) => {
  const maxLines = 42;
  const contentLines = lines.slice(0, maxLines).map((line, idx) => {
    const y = 790 - idx * 18;
    return `BT /F1 11 Tf 40 ${y} Td (${escapePdfText(line)}) Tj ET`;
  });

  const streamContent = contentLines.join('\n') + '\n';
  const streamLength = Buffer.byteLength(streamContent, 'utf8');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}endstream\nendobj\n`
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }

  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
};

router.get('/portfolio', async (req, res, next) => {
  void req;
  void next;
  return res.status(410).json({ error: { code: 'FEATURE_REMOVED', message: 'Exportar portfolio CSV fue removido.' } });
});

const handleAlertPdfExport = async (req, res, next) => {
  try {
    const format = String(req.query.format || '').toLowerCase();
    if (format !== 'pdf') {
      throw badRequest('Formato no soportado. Usá format=pdf', 'VALIDATION_ERROR');
    }

    const out = await query(
      `SELECT id, symbol, name, type, recommendation, confidence, confluence_bull, confluence_bear,
              signals, price_at_alert, stop_loss, take_profit, ai_thesis, snapshot, created_at
       FROM alerts
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (!out.rows.length) {
      throw notFound('Alerta no encontrada', 'ALERT_NOT_FOUND');
    }

    const row = out.rows[0];
    const filename = `horsai-alert-${row.symbol}-${new Date(row.created_at).toISOString().slice(0, 10)}.pdf`;

    const aiSummary = row.ai_thesis && typeof row.ai_thesis === 'object' ? row.ai_thesis.summary : null;
    const snapshot = row.snapshot && typeof row.snapshot === 'object' ? row.snapshot : {};

    const lines = [
      'Horsai - Alert Report',
      `Fecha exportacion: ${new Date().toISOString()}`,
      `Alerta ID: ${row.id}`,
      `Activo: ${row.symbol} - ${row.name || ''}`,
      `Tipo: ${row.type}`,
      `Recomendacion: ${row.recommendation}`,
      `Confianza: ${row.confidence}`,
      `Confluencia bull/bear: ${row.confluence_bull}/${row.confluence_bear}`,
      `Precio alerta: ${formatMoney(row.price_at_alert)}`,
      `Stop Loss: ${formatMoney(row.stop_loss)}`,
      `Take Profit: ${formatMoney(row.take_profit)}`,
      `Creada: ${new Date(row.created_at).toISOString()}`,
      `RSI snapshot: ${snapshot.rsi ?? 'N/D'}`,
      `ATR snapshot: ${snapshot.atr ?? 'N/D'}`,
      aiSummary ? `Tesis AI: ${String(aiSummary)}` : 'Tesis AI: N/D',
      'Disclaimer: No constituye recomendacion financiera profesional.'
    ];

    const pdfBuffer = buildSimplePdf(lines);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    return next(error);
  }
};

router.get('/alert/:id', handleAlertPdfExport);
router.post('/alert/:id', handleAlertPdfExport);

module.exports = router;
