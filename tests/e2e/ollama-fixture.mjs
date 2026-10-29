import { createServer } from 'node:http';

// HTTP-only fixture: the browser still exercises the real API adapter and database.
export async function startOllamaFixture() {
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/show') {
      res.end(JSON.stringify({ thinking: { values: [false], default: false } }));
      return;
    }
    if (req.url !== '/api/chat') {
      res.writeHead(404).end('{}');
      return;
    }
    const { messages } = JSON.parse(body);
    if (!messages?.length) {
      res.end(JSON.stringify({ done: true }));
      return;
    }
    const { message } = JSON.parse(messages[1].content);
    if (message === 'Proveedor inválido') {
      res.end(JSON.stringify({ done: true, message: { content: 'not JSON' } }));
      return;
    }
    if (messages[0].content.startsWith('Organize Spanish')) {
      const empty = { dateText: null, accountText: null, categoryText: null, paymentText: null };
      const items = [];
      let context = { ...empty };
      const notes = [];
      if (/\n/.test(message)) {
        for (const raw of message.split('\n')) {
          const line = raw.trim().replace(/^[-•]\s*/, '');
          if (!line) continue;
          if (/^(?:Hoy|Ayer|El viernes pasado|\d{1,2}\/\d{1,2}\/\d{4})[:.]?$/i.test(line)) {
            context = { ...context, dateText: line.replace(/[:.]$/, '') };
          } else if (/^(?:Transporte|Alimentación|Mercado):$/.test(line)) {
            context = { ...context, categoryText: line.slice(0, -1) };
          } else if (/^Todo con Nu:$/.test(line)) {
            context = { ...context, accountText: 'Todo con Nu' };
          } else if (/^Total/i.test(line)) notes.push(line);
          else
            items.push({
              text: line,
              context: { ...context },
              kind: /transfi|tarjeta de crédito.*pagué mi|pagué mi tarjeta/i.test(line)
                ? 'unsupported'
                : 'transaction',
            });
        }
      } else {
        const fragments = message.split(/;\s*| y después /);
        for (const text of fragments)
          items.push({ text, context: { ...empty }, kind: 'transaction' });
      }
      res.end(
        JSON.stringify({
          done: true,
          done_reason: 'stop',
          message: { content: JSON.stringify({ items, notes }) },
        }),
      );
      return;
    }
    const income = /salario/i.test(message);
    const liability = /tarjeta de cr[eé]dito|pasivo/.test(message);
    const uber = message.includes('Uber');
    const numeric = message
      .match(/(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?\s*(?:k|mil|pesos)?/gi)
      ?.filter((value) => !['2026', '2027'].includes(value.trim()));
    const content = {
      intent: 'transaction',
      type: income ? 'income' : liability ? 'liability' : 'expense',
      amountText: income
        ? message.includes('1000000')
          ? '1000000'
          : '2500000'
        : uber
          ? '15000'
          : message.includes('35k')
            ? '35000'
            : message.includes('35 mil')
              ? '35 mil'
              : message.includes('7500 pesos')
                ? '7500 pesos'
                : (numeric?.[numeric.length - 1]?.trim() ?? null),
      description: income
        ? null
        : uber
          ? 'Uber a casa de mis papás'
          : /almuerzo/i.test(message)
            ? 'Almuerzo'
            : 'Café',
      dateText: /\d{1,2}\/\d{1,2}\/\d{4}/.test(message)
        ? message.match(/\d{1,2}\/\d{1,2}\/\d{4}/)[0]
        : message.includes('viernes pasado')
          ? 'el viernes pasado'
          : message.includes('ayer')
            ? 'ayer'
            : null,
      accountMentioned: /Bancolombia|Nu/.test(message),
      accountName: message.includes('Nu')
        ? 'Nu'
        : message.includes('Bancolombia')
          ? 'Bancolombia'
          : null,
      categoryName: income
        ? 'Salario'
        : uber || /Transporte|taxi|bus/i.test(message)
          ? 'Transporte'
          : /Mercado|mercado/.test(message)
            ? 'Mercado'
            : 'Alimentación',
    };
    res.end(
      JSON.stringify({
        done: true,
        done_reason: 'stop',
        message: {
          content: JSON.stringify({ purchase: content.description, transaction: content }),
        },
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
