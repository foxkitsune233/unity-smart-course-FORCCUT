using System;
using UnityEngine;
namespace UnityCourseLab {
 [Serializable] public sealed class LabSaveData { public int schemaVersion; public string playerName; public int score,level; }
 public sealed class LabPersistenceActor : MonoBehaviour {
  public string StorageScope="";public LabSaveData Data; public string Status="ready",Json="";public int Saves,Loads,Clears;string key;
  public bool HasSave {get{return !string.IsNullOrEmpty(key)&&PlayerPrefs.HasKey(key);}}
  public static LabSaveData Parse(string json){
   if(string.IsNullOrWhiteSpace(json)||json.Length>4096||!json.TrimStart().StartsWith("{")||!json.TrimEnd().EndsWith("}"))throw new ArgumentException("JSON 数据为空、过大或格式错误。");
   LabSaveData d;try{d=JsonUtility.FromJson<LabSaveData>(json);}catch(Exception){throw new ArgumentException("JSON 格式错误。");}
   if(d==null||d.schemaVersion!=1||string.IsNullOrWhiteSpace(d.playerName)||d.playerName.Length>32||d.score<0||d.score>999999||d.level<1||d.level>100)throw new ArgumentException("JSON 需要 schemaVersion=1、1–32字姓名、score 0–999999、level 1–100。");return d;
  }
  public static bool ValidSlot(string slot){if(string.IsNullOrEmpty(slot)||slot.Length>32)return false;foreach(char c in slot)if(!char.IsLetterOrDigit(c)&&c!='-'&&c!='_')return false;return true;}
  public static string KeyFor(string scope,string slot){return "UnityCourseLab.LAB08."+(string.IsNullOrEmpty(scope)?"":scope+".")+slot;}
  public void Begin(string slot,string json){if(!ValidSlot(slot))throw new ArgumentException("存档槽仅允许1–32个字母、数字、下划线和横线。");key=KeyFor(StorageScope,slot);Data=Parse(json);Refresh();}
  void Refresh(){Json=JsonUtility.ToJson(Data);}
  public void Save(){Refresh();Parse(Json);PlayerPrefs.SetString(key,Json);PlayerPrefs.Save();Saves++;Status="saved";}
  public bool Load(){if(!HasSave){Status="missing";return false;}var loaded=Parse(PlayerPrefs.GetString(key));Data=loaded;Refresh();Loads++;Status="loaded";return true;}
  public void Clear(){PlayerPrefs.DeleteKey(key);PlayerPrefs.Save();Clears++;Status="cleared";}
  public void AddScore(){Data.score=Math.Min(999999,Data.score+1);Refresh();Status="changed";}
 }
}
