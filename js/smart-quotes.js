export default function convertSmartQuotes(text) {
  const codeSpans = [];
  const codeBlocks = [];
  const htmlTags = [];
  const htmlComments = [];
  const macros = [];
  const protectFencedCodeBlocks = (source, onBlock) => {
    const chunks = String(source || '').match(/.*?(?:\r?\n|$)/g) || [];
    let output = '';
    let inFence = false;
    let fenceChar = '';
    let fenceLength = 0;
    let fenceBuffer = '';

    for (const chunk of chunks) {
      if (chunk === '') continue;
      const line = chunk.replace(/\r?\n$/, '');

      if (!inFence) {
        const openMatch = line.match(/^\s{0,3}((`{3,}|~{3,}))[ \t]*.*$/);
        if (openMatch) {
          const fence = openMatch[1];
          inFence = true;
          fenceChar = fence[0];
          fenceLength = fence.length;
          fenceBuffer = chunk;
          continue;
        }
        output += chunk;
        continue;
      }

      fenceBuffer += chunk;
      const closeMatch = line.match(/^\s{0,3}([`~]{3,})[ \t]*$/);
      if (
        closeMatch &&
        closeMatch[1][0] === fenceChar &&
        closeMatch[1].length >= fenceLength
      ) {
        output += onBlock(fenceBuffer);
        inFence = false;
        fenceChar = '';
        fenceLength = 0;
        fenceBuffer = '';
      }
    }

    if (inFence && fenceBuffer) {
      // Leave unterminated fences untouched.
      output += fenceBuffer;
    }
    return output;
  };

  // Temporarily extract protected content
  let i = 0;
  text = protectFencedCodeBlocks(text, (m) => {
    codeBlocks.push(m);
    return `@@CODEBLOCK${i++}@@`;
  });

  text = text
    // Keep inline code span matching on a single line to avoid spanning across blocks.
    .replace(/`[^`\n]*`/g, m => {
      codeSpans.push(m);
      return `@@CODESPAN${i++}@@`;
    })
    .replace(/<!--[\s\S]*?-->/g, m => {
      htmlComments.push(m);
      return `@@COMMENT${i++}@@`;
    })
    .replace(/<[^>]+>/g, m => {
      htmlTags.push(m);
      return `@@TAG${i++}@@`;
    })
    .replace(/\{\{[^}]+\}\}/g, m => {
      macros.push(m);
      return `@@MACRO${i++}@@`;
    });

  // Replace straight quotes in the remaining text
  text = text
    // Smart double quotes
    .replace(/(\W|^)"(?=\S)/g, '$1“')  // opening
    .replace(/"(?=\W|$)/g, '”')       // closing
    // Smart single quotes
    .replace(/(\W|^)'(?=\S)/g, '$1‘')  // opening
    .replace(/'(?=\W|$)/g, '’');      // closing

  // Restore protected content
  i = 0;
  text = text
    .replace(/@@CODESPAN\d+@@/g, () => codeSpans.shift())
    .replace(/@@COMMENT\d+@@/g, () => htmlComments.shift())
    .replace(/@@TAG\d+@@/g, () => htmlTags.shift())
    .replace(/@@MACRO\d+@@/g, () => macros.shift())
    // Restore fenced code blocks last so tokens reintroduced by other restores are still resolved.
    .replace(/@@CODEBLOCK\d+@@/g, () => codeBlocks.shift());

  return text;
}
