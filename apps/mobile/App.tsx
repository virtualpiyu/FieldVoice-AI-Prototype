import React, { useEffect, useRef, useState } from "react";
import { SafeAreaView, StatusBar, View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";

const WINE = "#b94a76";
const BG = "#0b0609";
const CARD = "#170a10";
const TEXT = "#f7edf2";
const MUTED = "#907c86";

export default function App() {
  const [screen, setScreen] = useState<"home"|"record"|"report">("home");
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  async function start() {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) return;
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const r = new Audio.Recording();
    await r.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await r.startAsync();
    setSeconds(0);
    setRecording(r);
    setScreen("record");
  }

  async function stop() {
    if (!recording) return;
    await recording.stopAndUnloadAsync();
    setRecording(null);
    setScreen("report");
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      {screen === "home" && (
        <ScrollView contentContainerStyle={styles.page}>
          <View style={styles.top}>
            <View style={styles.brand}>
              <View style={styles.mark}><Ionicons name="mic" size={18} color="white" /></View>
              <View><Text style={styles.brandName}>FIELDVOICE</Text><Text style={styles.brandSub}>AI FIELD INTELLIGENCE</Text></View>
            </View>
            <View style={styles.avatar}><Text style={styles.avatarText}>PK</Text></View>
          </View>

          <Text style={styles.eyebrow}>GOOD MORNING, PIYUSH</Text>
          <Text style={styles.h1}>How did the meeting{"\n"}actually go?</Text>
          <Text style={styles.copy}>Record your raw field experience. FieldVoice AI will turn it into a report you can review and submit.</Text>

          <View style={styles.clientCard}>
            <View style={styles.clientIcon}><Text style={styles.clientLetters}>AB</Text></View>
            <View style={{flex:1}}><Text style={styles.clientName}>ABC Industries</Text><Text style={styles.clientMeta}>Karad Industrial Estate</Text></View>
            <Ionicons name="chevron-forward" size={18} color="#725e68" />
          </View>

          <Pressable style={styles.recordButton} onPress={start}>
            <View style={styles.recordOrb}><Ionicons name="mic" size={30} color="white" /></View>
            <Text style={styles.recordTitle}>Record field visit</Text>
            <Text style={styles.recordSub}>30–60 sec • natural voice note</Text>
          </Pressable>

          <View style={styles.metricRow}>
            <Metric value="4" label="Visits today" />
            <Metric value="3" label="Reports" />
            <Metric value="3" label="Follow-ups" />
          </View>

          <Text style={styles.section}>RECENT REPORT</Text>
          <View style={styles.reportCard}>
            <View style={styles.reportTop}>
              <View style={styles.clientIconSmall}><Text style={styles.clientLetters}>AB</Text></View>
              <View style={{flex:1}}><Text style={styles.clientName}>ABC Industries</Text><Text style={styles.clientMeta}>Cautious • 82% interest</Text></View>
              <View style={styles.priority}><Text style={styles.priorityText}>HIGH</Text></View>
            </View>
            <Text style={styles.reportText}>Client is intrested but pricing is the decisive blocker. Revised quote requested.</Text>
          </View>
        </ScrollView>
      )}

      {screen === "record" && (
        <View style={styles.page}>
          <View style={styles.top}>
            <Pressable onPress={() => setScreen("home")}><Ionicons name="chevron-back" size={23} color={TEXT} /></Pressable>
            <Text style={styles.topTitle}>FIELD VISIT</Text>
            <Text style={styles.timerLimit}>MAX 60 SEC</Text>
          </View>
          <View style={styles.recordScreen}>
            <Text style={styles.eyebrow}>ABC INDUSTRIES</Text>
            <Text style={styles.timer}>{String(Math.floor(seconds/60)).padStart(2,"0")}:{String(seconds%60).padStart(2,"0")}</Text>
            <Text style={styles.copyCenter}>Tell us how the meeting actually went — include how the client felt, what they asked, and what happens next.</Text>
            <View style={styles.wave}>{Array.from({length:24}).map((_,i)=><View key={i} style={[styles.bar,{height:10+(i*17)%44}]} />)}</View>
            <Pressable style={styles.recordButtonCircle} onPress={stop}>
              <View style={styles.stopCircle}><View style={styles.stopSquare}/></View>
            </Pressable>
            <Text style={styles.recordSub}>Tap to stop & analyze</Text>
          </View>
        </View>
      )}

      {screen === "report" && (
        <ScrollView contentContainerStyle={styles.page}>
          <View style={styles.top}>
            <Pressable onPress={() => setScreen("home")}><Ionicons name="chevron-back" size={23} color={TEXT} /></Pressable>
            <Text style={styles.topTitle}>AI REPORT</Text>
            <View style={styles.aiPill}><Ionicons name="sparkles" size={12} color="#78d5a7" /></View>
          </View>

          <Text style={styles.h2}>Review before you submit</Text>
          <Text style={styles.copy}>FieldVoice AI extracted the important signals.</Text>

          <View style={styles.voiceMini}>
            <View style={styles.play}><Ionicons name="play" size={14} color="#d87598" /></View>
            <View style={{flex:1}}><Text style={styles.voiceTitle}>Original voice note</Text><Text style={styles.clientMeta}>00:27 • captured today</Text></View>
            <Ionicons name="headset-outline" size={17} color="#765f69" />
          </View>

          <Label>MEETING SUMMARY</Label>
          <View style={styles.input}><Text style={styles.value}>Client showed interest but raised pricing concerns and requested a revised commercial offer.</Text></View>

          <View style={styles.twoCol}>
            <View style={{flex:1}}><Label>CLIENT SENTIMENT</Label><Badge text="Cautious" gold /></View>
            <View style={{flex:1}}><Label>Intrest</Label><Text style={styles.bigValue}>82%</Text></View>
          </View>

          <Label>KEY CONCERNS</Label>
          <View style={styles.tags}><Tag text="Pricing"/><Tag text="Competitor comparison"/><Tag text="Delivery timeline"/></View>

          <Label>NEXT ACTIONS</Label>
          <View style={styles.input}>
            <Text style={styles.action}>✓  Send revised quotation</Text>
            <Text style={styles.action}>✓  Share delivery SLA</Text>
            <Text style={styles.action}>✓  Follow up Friday</Text>
          </View>

          <View style={styles.insight}>
            <Ionicons name="bulb-outline" size={18} color="#d76e93" />
            <View style={{flex:1}}><Text style={styles.eyebrow}>AI KEY INSIGHT</Text><Text style={styles.insightTitle}>High intent, pricing is the blocker.</Text><Text style={styles.insightText}>Commercial follow-up can protect momentum.</Text></View>
          </View>

          <Pressable style={styles.submit} onPress={() => setScreen("home")}>
            <Text style={styles.submitText}>Submit report</Text><Ionicons name="arrow-up" size={17} color="white"/>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Metric({value,label}:{value:string,label:string}) {
  return <View style={{flex:1}}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>
}
function Label({children}:{children:React.ReactNode}) { return <Text style={styles.label}>{children}</Text> }
function Badge({text,gold}:{text:string,gold?:boolean}) { return <View style={[styles.badge,gold&&styles.badgeGold]}><View style={[styles.badgeDot,gold&&styles.badgeDotGold]}/><Text style={styles.badgeText}>{text}</Text></View> }
function Tag({text}:{text:string}) { return <View style={styles.tag}><Text style={styles.tagText}>{text}</Text></View> }

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:BG},
  page:{padding:20,paddingBottom:40},
  top:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:28},
  brand:{flexDirection:"row",alignItems:"center",gap:9},
  mark:{width:32,height:32,borderRadius:10,backgroundColor:WINE,alignItems:"center",justifyContent:"center"},
  brandName:{color:TEXT,fontSize:12,fontWeight:"900",letterSpacing:2},
  brandSub:{color:"#715c66",fontSize:7,letterSpacing:1},
  avatar:{width:31,height:31,borderRadius:10,backgroundColor:"#3a1828",alignItems:"center",justifyContent:"center"},
  avatarText:{color:"#eac7d5",fontSize:10,fontWeight:"900"},
  eyebrow:{color:"#a65b77",fontSize:8,fontWeight:"800",letterSpacing:1.7},
  h1:{color:TEXT,fontSize:35,fontWeight:"900",letterSpacing:-1.5,lineHeight:37,marginTop:10},
  h2:{color:TEXT,fontSize:25,fontWeight:"900",marginTop:5},
  copy:{color:MUTED,fontSize:11,lineHeight:18,marginTop:10},
  copyCenter:{color:MUTED,fontSize:11,lineHeight:18,textAlign:"center",maxWidth:320,marginTop:10},
  clientCard:{flexDirection:"row",alignItems:"center",padding:13,backgroundColor:CARD,borderRadius:14,borderWidth:1,borderColor:"#321d26",marginTop:20},
  clientIcon:{width:40,height:40,borderRadius:11,backgroundColor:"#351525",alignItems:"center",justifyContent:"center",marginRight:10},
  clientIconSmall:{width:31,height:31,borderRadius:9,backgroundColor:"#351525",alignItems:"center",justifyContent:"center",marginRight:9},
  clientLetters:{color:"#d89ab3",fontSize:10,fontWeight:"900"},
  clientName:{color:"#e9dde2",fontSize:12,fontWeight:"800"},
  clientMeta:{color:"#6e5b65",fontSize:8,marginTop:3},
  recordButton:{marginTop:18,padding:22,borderRadius:18,backgroundColor:"#1a0c13",borderWidth:1,borderColor:"#422231",alignItems:"center",shadowColor:WINE,shadowOpacity:.18,shadowRadius:20},
  recordOrb:{width:68,height:68,borderRadius:34,backgroundColor:WINE,alignItems:"center",justifyContent:"center",marginBottom:11},
  recordTitle:{color:TEXT,fontSize:15,fontWeight:"800"},
  recordSub:{color:"#77616c",fontSize:9,marginTop:5},
  metricRow:{flexDirection:"row",paddingVertical:22,borderBottomWidth:1,borderTopWidth:1,borderColor:"#24171d",marginTop:16},
  metricValue:{color:TEXT,fontSize:24,fontWeight:"900"},
  metricLabel:{color:"#705d67",fontSize:8,marginTop:3},
  section:{color:"#7d6571",fontSize:8,fontWeight:"900",letterSpacing:1.6,marginTop:22,marginBottom:10},
  reportCard:{padding:14,borderRadius:15,backgroundColor:CARD,borderWidth:1,borderColor:"#2e1a23"},
  reportTop:{flexDirection:"row",alignItems:"center"},
  priority:{paddingHorizontal:7,paddingVertical:4,borderRadius:999,backgroundColor:"#411821"},
  priorityText:{color:"#ef8aa2",fontSize:8,fontWeight:"900"},
  reportText:{color:"#9e8c95",fontSize:10,lineHeight:16,marginTop:12},
  topTitle:{color:"#c8b6bf",fontSize:10,fontWeight:"800",letterSpacing:1.3},
  timerLimit:{color:"#6f5b65",fontSize:8},
  recordScreen:{flex:1,alignItems:"center",justifyContent:"center",paddingBottom:70},
  timer:{color:TEXT,fontSize:52,fontWeight:"900",marginTop:12,letterSpacing:-2},
  wave:{height:62,flexDirection:"row",alignItems:"center",gap:3,marginTop:14,opacity:.45},
  bar:{width:4,borderRadius:4,backgroundColor:WINE},
  recordButtonCircle:{marginTop:28,width:88,height:88,borderRadius:44,backgroundColor:"#351322",alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:"#a63a63"},
  stopCircle:{width:68,height:68,borderRadius:34,backgroundColor:WINE,alignItems:"center",justifyContent:"center"},
  stopSquare:{width:21,height:21,borderRadius:4,backgroundColor:"white"},
  aiPill:{width:25,height:25,borderRadius:8,backgroundColor:"#173326",alignItems:"center",justifyContent:"center"},
  voiceMini:{flexDirection:"row",alignItems:"center",padding:11,backgroundColor:"#12090e",borderRadius:12,borderWidth:1,borderColor:"#2e1b23",marginTop:18},
  play:{width:32,height:32,borderRadius:16,backgroundColor:"#351423",alignItems:"center",justifyContent:"center",marginRight:9},
  voiceTitle:{color:"#c9bac1",fontSize:9,fontWeight:"700"},
  label:{color:"#765f69",fontSize:8,fontWeight:"800",letterSpacing:1.1,marginTop:18,marginBottom:7},
  input:{backgroundColor:"#11080d",borderRadius:12,borderWidth:1,borderColor:"#2a1920",padding:12},
  value:{color:"#a999a1",fontSize:10,lineHeight:16},
  twoCol:{flexDirection:"row",gap:12},
  badge:{flexDirection:"row",alignItems:"center",alignSelf:"flex-start",backgroundColor:"#24171d",borderWidth:1,borderColor:"#3b2830",paddingHorizontal:8,paddingVertical:6,borderRadius:999},
  badgeGold:{backgroundColor:"#2d220f",borderColor:"#4c3918"},
  badgeDot:{width:6,height:6,borderRadius:3,backgroundColor:"#93828a",marginRight:5},
  badgeDotGold:{backgroundColor:"#efb84f"},
  badgeText:{color:"#b5a5ad",fontSize:9},
  bigValue:{color:TEXT,fontSize:23,fontWeight:"900"},
  tags:{flexDirection:"row",flexWrap:"wrap",gap:7},
  tag:{backgroundColor:"#24111a",borderWidth:1,borderColor:"#41202e",paddingHorizontal:8,paddingVertical:6,borderRadius:999},
  tagText:{color:"#c18ea2",fontSize:8},
  action:{color:"#a899a0",fontSize:10,lineHeight:18},
  insight:{flexDirection:"row",gap:9,backgroundColor:"#1e0e15",borderWidth:1,borderColor:"#472332",borderRadius:13,padding:12,marginTop:17},
  insightTitle:{color:"#ddcbd3",fontSize:10,fontWeight:"800",marginTop:3},
  insightText:{color:"#75626b",fontSize:8,lineHeight:14,marginTop:3},
  submit:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,backgroundColor:WINE,padding:14,borderRadius:12,marginTop:18}
  ,submitText:{color:"white",fontSize:11,fontWeight:"900"}
});
