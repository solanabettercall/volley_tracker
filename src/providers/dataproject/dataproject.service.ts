import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataprojectApiService } from './dataproject-api.service';

@Injectable()
export class DataprojectService implements OnApplicationBootstrap {
  constructor(private readonly dataprojectApiService: DataprojectApiService) {}

  async onApplicationBootstrap() {
    const client = this.dataprojectApiService.getClient('cvf');
    const match = await client.getMatchesInfo([4607]);
    console.log(JSON.stringify(match[0], null, 2));
    // const lineUpData = await client.getMatchLineupPlayerIds(4607);
    // console.log(lineUpData);
    // // const matchIds = await client.getMatchIds();
    // // console.log(matchIds);
    // const matchesInfo = await client.getMatchesInfo([4607]);

    // const matchPlayers = matchesInfo[0].home.players;

    // console.log(`Игроков на матче:`, matchPlayers.length);
    // console.log(matchPlayers);

    // const teamRoster = await client.getTeamRoster(matchesInfo[0].home.id);
    // console.log(`Игроков в заявке:`, teamRoster.length);

    // console.log(teamRoster);

    // // Игроки, которые были на матче, но не были в заявке (добавились)
    // const added = matchPlayers.filter(
    //   (matchPlayer) =>
    //     !teamRoster.some((rosterPlayer) => rosterPlayer.id === matchPlayer.id),
    // );

    // // Игроки, которые были в заявке, но не вышли на матч (убрали)
    // const removed = teamRoster.filter(
    //   (rosterPlayer) =>
    //     !matchPlayers.some((matchPlayer) => matchPlayer.id === rosterPlayer.id),
    // );

    // // Убираем дубликаты (например, Dvořáková Viktorie дважды в заявке)
    // const uniqueRemoved = Array.from(
    //   new Map(removed.map((player) => [player.id, player])).values(),
    // );

    // console.log(`🟢 Добавлены в матч (не было в заявке): ${added.length}`);
    // console.log(added);

    // console.log(
    //   `🔴 Убраны из матча (были в заявке, но не играли): ${uniqueRemoved.length}`,
    // );
    // console.log(uniqueRemoved);

    // if (!matchesInfo.length) {
    //   Logger.debug(`Матчей в ${client.countrySlug} не запланировано`);
    //   return;
    // }

    // // Обрабатываем каждый матч
    // for (const match of matchesInfo) {
    //   // Обработка домашней команды
    //   if (match.home) {
    //     const homeRoster = await client.getTeamRoster(match.home.id);
    //     match.home.addedPlayers = match.home.players.filter(
    //       (matchPlayer) =>
    //         !homeRoster.some(
    //           (rosterPlayer) => rosterPlayer.id === matchPlayer.id,
    //         ),
    //     );
    //     match.home.removedPlayers = homeRoster.filter(
    //       (rosterPlayer) =>
    //         !match.home.players.some(
    //           (matchPlayer) => matchPlayer.id === rosterPlayer.id,
    //         ),
    //     );
    //   }

    //   // Обработка гостевой команды
    //   if (match.guest) {
    //     const guestRoster = await client.getTeamRoster(match.guest.id);
    //     match.guest.addedPlayers = match.guest.players.filter(
    //       (matchPlayer) =>
    //         !guestRoster.some(
    //           (rosterPlayer) => rosterPlayer.id === matchPlayer.id,
    //         ),
    //     );
    //     match.guest.removedPlayers = guestRoster.filter(
    //       (rosterPlayer) =>
    //         !match.guest.players.some(
    //           (matchPlayer) => matchPlayer.id === rosterPlayer.id,
    //         ),
    //     );
    //   }
    // }

    // const filteredMatchesInfo = matchesInfo.filter(
    //   (mi) =>
    //     mi.guest.addedPlayers.length > 0 ||
    //     mi.guest.removedPlayers.length > 0 ||
    //     mi.home.addedPlayers.length > 0 ||
    //     mi.home.removedPlayers.length > 0,
    // );

    // console.log(JSON.stringify(filteredMatchesInfo, null, 2));
  }
}
