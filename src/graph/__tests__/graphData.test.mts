import { buildGraphData, extractLinks } from "../buildGraphData";
import type { VaultNode } from "../../state/vaultTypes";
let pass=0, fail=0;
const eq=(n:string,g:unknown,w:unknown)=>{const a=JSON.stringify(g),b=JSON.stringify(w);
  if(a===b){pass++;console.log(`  ok  ${n}`);}else{fail++;console.log(`  FAIL ${n}\n       got  ${a}\n       want ${b}`);}};
const note=(n:string,p="/"+n+".md"):VaultNode=>({name:n+".md",path:p,isFolder:false});
const folder=(n:string,p:string,c:VaultNode[]):VaultNode=>({name:n,path:p,isFolder:true,children:c});
const build=(t:VaultNode[],d:Record<string,string>,a="")=>buildGraphData(t,(p)=>d[p]??"",a);
const edgeSet=(g:{edges:{from:string;to:string}[]})=>g.edges.map(e=>`${e.from}->${e.to}`).sort();
const deg=(g:any,p:string)=>g.nodes.find((n:any)=>n.path===p).degree;

console.log("\n— extractLinks —");
eq("plain",extractLinks("see [[Alpha]]"),["Alpha"]);
eq("two",extractLinks("[[A]] and [[B]]"),["A","B"]);
eq("dedup",extractLinks("[[A]] [[A]]"),["A"]);
eq("trim",extractLinks("[[  A  ]]"),["A"]);
eq("empty",extractLinks("[[]] [[ ]]"),[]);
eq("two parts → both are targets",extractLinks("[[A|B]]"),["A","B"]);
eq("multi [[L|A|B]]",extractLinks("[[L|A|B]]"),["L","A","B"]);
eq("single bracket",extractLinks("[A]"),[]);
eq("unclosed",extractLinks("[[A"),[]);
eq("nested",extractLinks("[[A]]]"),["A"]);
eq("inline code",extractLinks("`[[A]]`"),[]);
eq("fenced code",extractLinks("```\n[[A]]\n```"),[]);
eq("after fence",extractLinks("```\n[[A]]\n```\n[[B]]"),["B"]);
eq("tilde fence",extractLinks("~~~\n[[A]]\n~~~\n[[B]]"),["B"]);
eq("unterminated fence",extractLinks("```\n[[A]]"),[]);
eq("indented fence",extractLinks("  ```\n  [[A]]\n  ```\n[[B]]"),["B"]);
eq("mismatched marker stays open",extractLinks("```\n[[A]]\n~~~\n[[B]]\n```\n[[C]]"),["C"]);
eq("code span then link",extractLinks("`x` [[A]]"),["A"]);
eq("double backtick span",extractLinks("``[[A]]`` [[B]]"),["B"]);
eq("newline inside rejected",extractLinks("[[A\nB]]"),[]);
eq("frontmatter then link",extractLinks("---\ntags: [[A]]\n---\n[[B]]"),["B"]);
eq("--- mid-doc not frontmatter",extractLinks("text\n---\n[[A]]"),["A"]);
eq("multiline",extractLinks("[[A]]\nx\n[[B]]"),["A","B"]);

console.log("\n— buildGraphData —");
{const g=build([note("A"),note("B")],{"/A.md":"[[B]]","/B.md":""});
 eq("simple edge",edgeSet(g),["/A.md->/B.md"]); eq("degree A",deg(g,"/A.md"),1);}
{const g=build([note("A"),note("B")],{"/A.md":"[[B]]","/B.md":"[[A]]"});
 eq("mutual = 2 edges",edgeSet(g),["/A.md->/B.md","/B.md->/A.md"]); eq("mutual degree",deg(g,"/A.md"),2);}
{const g=build([note("A")],{"/A.md":"[[A]]"}); eq("self edge",edgeSet(g),["/A.md->/A.md"]); eq("self degree",deg(g,"/A.md"),2);}
{const g=build([note("A"),note("B")],{"/A.md":"[[Ghost]]","/B.md":""}); eq("dangling → no edge",edgeSet(g),[]);}
{const g=build([note("A"),note("Beta")],{"/A.md":"[[beta]]","/Beta.md":""}); eq("case-insensitive",edgeSet(g),["/A.md->/Beta.md"]);}
{const g=build([note("A"),note("Beta")],{"/A.md":"[[beta]] [[BETA]] [[Beta]]","/Beta.md":""});
 eq("same target different case → ONE edge",edgeSet(g),["/A.md->/Beta.md"]); eq("degree not inflated",deg(g,"/Beta.md"),1);}
{const g=build([note("A"),note("B")],{"/A.md":"[[B|missing]] [[B]]","/B.md":""});
 eq("multi target + direct to same note → one edge",edgeSet(g),["/A.md->/B.md"]);}
{const g=build([note("A"),folder("sub","/sub",[note("B","/sub/B.md")])],{"/A.md":"[[B]]","/sub/B.md":""});
 eq("link into subfolder",edgeSet(g),["/A.md->/sub/B.md"]);}
{const g=build([note("A"),note("B"),note("C")],{"/A.md":"[[B|C]]","/B.md":"","/C.md":""});
 eq("two parts → edges to both",edgeSet(g),["/A.md->/B.md","/A.md->/C.md"]);}
{const g=build([note("A"),note("B")],{"/A.md":"[[B#Section]]","/B.md":""});
 eq("heading anchor resolves to note",edgeSet(g),["/A.md->/B.md"]);}
{const g=build([note("A"),note("B")],{"/A.md":"[[B.md]]","/B.md":""});
 eq(".md suffix resolves to note",edgeSet(g),["/A.md->/B.md"]);}
{const g=build([note("A"),folder("sub","/sub",[note("B","/sub/B.md")])],{"/A.md":"[[sub/B]]","/sub/B.md":""});
 eq("path link resolves by relative path",edgeSet(g),["/A.md->/sub/B.md"]);}
{const g=build([note("A"),note("B"),note("C"),note("L")],{"/A.md":"[[L|B|C]]","/B.md":"","/C.md":"","/L.md":""});
 eq("multi-link edges",edgeSet(g),["/A.md->/B.md","/A.md->/C.md","/A.md->/L.md"]);}
{const g=build([note("A"),note("B")],{"/A.md":"[[B]] [[B]]","/B.md":""}); eq("repeated → one edge",edgeSet(g),["/A.md->/B.md"]);}
{const g=build([note("A"),note("B")],{"/A.md":"---\ntags: [[B]]\n---\n","/B.md":""}); eq("frontmatter link ignored",edgeSet(g),[]);}
{const g=build([note("A"),note("B")],{"/A.md":"```\n[[B]]\n```","/B.md":""}); eq("code-fence link ignored",edgeSet(g),[]);}
{const g=build([folder("x","/x",[note("Dup","/x/Dup.md")]),folder("y","/y",[note("Dup","/y/Dup.md")])],{"/x/Dup.md":"","/y/Dup.md":""});
 eq("dup titles both nodes",g.nodes.length,2);}
{const g=build([note("A"),folder("x","/x",[note("Dup","/x/Dup.md")]),folder("y","/y",[note("Dup","/y/Dup.md")])],
  {"/A.md":"[[Dup]]","/x/Dup.md":"","/y/Dup.md":""});
 eq("ambiguous title → exactly one edge",g.edges.length,1);}
{const g=build([note("A"),note("B"),note("C")],{"/A.md":"[[B]]","/B.md":"[[C]]","/C.md":""},"/A.md");
 const L=(p:string)=>g.nodes.find(n=>n.path===p)!.layer; eq("layers",[L("/A.md"),L("/B.md"),L("/C.md")],[0,1,2]);}
{const g=build([note("A"),note("B")],{"/A.md":"[[B]]","/B.md":""},""); eq("no active → layer 999",g.nodes.every(n=>n.layer===999),true);}
{const g=build([note("A"),{name:"img.png",path:"/img.png",isFolder:false}] as VaultNode[],{"/A.md":""}); eq("non-md excluded",g.nodes.length,1);}
{const g=build([],{}); eq("empty vault",[g.nodes.length,g.edges.length],[0,0]);}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) throw new Error(`${fail} graph test(s) failed`);
