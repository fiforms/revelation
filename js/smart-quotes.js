export default function convertSmartQuotes(text) {
  const codeSpans = [];
  const codeBlocks = [];
  const htmlTags = [];
  const htmlComments = [];
  const macros = [];

  // Temporarily extract protected content
  let i = 0;
  text = text
    .replace(/```[\s\S]*?```/g, m => {
      codeBlocks.push(m);
      return `@@CODEBLOCK${i++}@@`;
    })
    .replace(/`[^`]*`/g, m => {
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
    .replace(/@@CODEBLOCK\d+@@/g, () => codeBlocks.shift())
    .replace(/@@CODESPAN\d+@@/g, () => codeSpans.shift())
    .replace(/@@COMMENT\d+@@/g, () => htmlComments.shift())
    .replace(/@@TAG\d+@@/g, () => htmlTags.shift())
    .replace(/@@MACRO\d+@@/g, () => macros.shift());

  return text;
}

